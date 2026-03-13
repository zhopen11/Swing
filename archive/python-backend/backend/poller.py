"""The Swing — Background polling loop."""

import threading
import time
import logging

from . import espn, momentum, alerts, db
from .config import POLL_INTERVAL, LIVE_STATUSES

logger = logging.getLogger(__name__)


class Poller:
    def __init__(self, db_path=None):
        self.db_path = db_path
        self.halftime_cache = {}  # game_id -> momentum dict
        self.chart_cache = {}     # game_id -> (chart_away, chart_home)
        self._thread = None
        self._stop = threading.Event()
        self.tick = 0

    def start(self):
        """Start polling in a daemon thread."""
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("Poller started (every %ds)", POLL_INTERVAL)

    def stop(self):
        """Signal the polling thread to stop."""
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _loop(self):
        while not self._stop.is_set():
            try:
                self.poll_once()
            except Exception:
                logger.exception("Poll cycle failed")
            self._stop.wait(POLL_INTERVAL)

    def poll_once(self):
        """Execute one full poll cycle."""
        self.tick += 1
        logger.info("Poll tick %d", self.tick)

        conn = db.get_connection(self.db_path)
        try:
            # Fetch scoreboards
            nba_events = espn.fetch_nba_scoreboard()
            cbb_events = espn.fetch_cbb_scoreboard()

            all_events = (
                [(e, "NBA") for e in nba_events]
                + [(e, "CBB") for e in cbb_events]
            )

            for event, league in all_events:
                game = espn.parse_scoreboard_event(event, league)
                self._process_game(conn, game)

            conn.commit()
        finally:
            conn.close()

    def _process_game(self, conn, game):
        """Process a single game: fetch detail, compute momentum, detect alerts."""
        game_id = game["id"]

        # Halftime freeze: reuse cached momentum
        if game["status"] == "STATUS_HALFTIME" and game_id in self.halftime_cache:
            game["mom"] = self.halftime_cache[game_id]
            self._detect_and_store_alerts(conn, game)
            db.upsert_game(conn, game)
            return

        # Determine if we need play-by-play detail
        need_detail = (
            game["status"] in LIVE_STATUSES
            or (game["status"] == "STATUS_FINAL" and (game.get("period") or 0) >= 2)
        )

        if need_detail:
            summary = espn.fetch_game_summary(game_id, game["league"])
            plays = espn.get_plays_from_summary(summary)

            if plays:
                mom = momentum.compute_momentum_from_plays(
                    plays,
                    game["away_abbr"], game["home_abbr"],
                    game.get("away_id"), game.get("home_id"),
                )

                if mom:
                    # Chart history preservation
                    if game_id in self.chart_cache:
                        prev_away, prev_home = self.chart_cache[game_id]
                        if len(prev_away) > len(mom["chart_away"]):
                            mom["chart_away"] = prev_away
                            mom["chart_home"] = prev_home

                    self.chart_cache[game_id] = (mom["chart_away"], mom["chart_home"])
                    game["mom"] = mom

                    # Cache for halftime freeze
                    if game["status"] == "STATUS_HALFTIME":
                        self.halftime_cache[game_id] = mom
                    elif game_id in self.halftime_cache:
                        del self.halftime_cache[game_id]

                    # Store plays
                    play_rows = []
                    for idx, row in enumerate(mom["scored_plays"]):
                        play_rows.append((game_id, idx, *row))
                    db.store_plays(conn, game_id, play_rows)

                    # Store snapshots
                    snap_rows = []
                    for idx, (ca, ch) in enumerate(zip(mom["chart_away"], mom["chart_home"])):
                        snap_rows.append((
                            game_id, idx, ca["v"], ch["v"],
                            ca.get("p"), ca.get("c"), ca.get("t"),
                            ca.get("hs"), ca.get("as"),
                            db.now_iso(),
                        ))
                    db.store_momentum_snapshots(conn, game_id, snap_rows)

                    # Store final momentum
                    db.store_game_momentum(
                        conn, game_id,
                        mom["away"], mom["home"],
                        mom["total_plays"], mom["total_teamed"],
                    )

        self._detect_and_store_alerts(conn, game)
        db.upsert_game(conn, game)

    def _detect_and_store_alerts(self, conn, game):
        """Run alert detection and store any new alerts."""
        if not game.get("mom"):
            return

        result = alerts.detect_alerts(game)
        game_id = game["id"]

        for alert_type, key in [
            ("BLUFFING", "bluffing"),
            ("COMEBACK", "comeback"),
            ("SWING_WARNING", "swing_warning"),
        ]:
            if result[key]:
                db.store_alert(
                    conn, game_id, alert_type,
                    game["mom"]["away"], game["mom"]["home"],
                    game["away_score"], game["home_score"],
                    game.get("period"), game.get("clock"),
                )
