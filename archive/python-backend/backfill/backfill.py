"""The Swing — Historical backfill script.

Usage:
    python -m backfill.backfill [--league NBA|CBB] [--start YYYY-MM-DD] [--end YYYY-MM-DD]

Pulls completed games from ESPN, runs the momentum algorithm, stores results
in SQLite, and evaluates alert accuracy.
"""

import argparse
import logging
import time
from datetime import date

from backend import espn, momentum, alerts, db
from backend.config import BACKFILL_DELAY
from backfill.season import discover_games

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)


def process_game(conn, game_id, event, league, game_date):
    """Process a single completed game: fetch PBP, compute momentum, evaluate alerts."""

    # Skip if already processed
    if db.has_game_momentum(conn, game_id):
        logger.info("  Skipping %s (already processed)", game_id)
        return None

    game = espn.parse_scoreboard_event(event, league)
    game["game_date"] = game_date

    # Fetch play-by-play
    summary = espn.fetch_game_summary(game_id, league)
    plays = espn.get_plays_from_summary(summary)

    if not plays:
        logger.warning("  No plays found for %s", game_id)
        db.upsert_game(conn, game)
        return None

    # Compute momentum
    mom = momentum.compute_momentum_from_plays(
        plays,
        game["away_abbr"], game["home_abbr"],
        game.get("away_id"), game.get("home_id"),
    )

    if not mom:
        logger.warning("  Momentum computation returned None for %s", game_id)
        db.upsert_game(conn, game)
        return None

    game["mom"] = mom

    # Store game
    db.upsert_game(conn, game)

    # Store plays
    play_rows = []
    for idx, row in enumerate(mom["scored_plays"]):
        play_rows.append((game_id, idx, *row))
    db.store_plays(conn, game_id, play_rows)

    # Store momentum snapshots
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

    # Simulate alert detection at each chart point
    alert_log = simulate_alerts(conn, game, mom)

    conn.commit()
    return alert_log


def simulate_alerts(conn, game, mom):
    """Walk through chart snapshots and detect alerts at each point.

    Returns a summary dict for the backfill_log.
    """
    bluffing_count = 0
    comeback_count = 0
    swing_warn_count = 0
    bluff_outcomes = []
    comeback_outcomes = []

    chart_away = mom["chart_away"]
    chart_home = mom["chart_home"]
    final_away_score = game["away_score"]
    final_home_score = game["home_score"]

    for i, (ca, ch) in enumerate(zip(chart_away, chart_home)):
        # Build a game-state snapshot at this chart point
        snap_game = {
            "status": "STATUS_IN_PROGRESS",  # simulate live
            "away_score": ca.get("as") or 0,
            "home_score": ca.get("hs") or 0,
            "mom": {"away": ca["v"], "home": ch["v"]},
        }

        result = alerts.detect_alerts(snap_game)

        if result["bluffing"]:
            bluffing_count += 1
            # Store alert
            db.store_alert(
                conn, game["id"], "BLUFFING",
                ca["v"], ch["v"],
                snap_game["away_score"], snap_game["home_score"],
                ca.get("p"), ca.get("c"),
            )
            # Evaluate: did the score leader change by end of game?
            score_leader_at_alert = "away" if snap_game["away_score"] > snap_game["home_score"] else "home"
            final_leader = "away" if final_away_score > final_home_score else "home"
            bluff_outcomes.append(1 if score_leader_at_alert != final_leader else 0)

        elif result["comeback"]:
            comeback_count += 1
            db.store_alert(
                conn, game["id"], "COMEBACK",
                ca["v"], ch["v"],
                snap_game["away_score"], snap_game["home_score"],
                ca.get("p"), ca.get("c"),
            )
            # Evaluate: did the trailing team close the gap or take the lead?
            trailing_at_alert = "away" if snap_game["away_score"] < snap_game["home_score"] else "home"
            gap_at_alert = abs(snap_game["away_score"] - snap_game["home_score"])
            final_gap = final_away_score - final_home_score
            if trailing_at_alert == "away":
                final_gap_for_trailing = final_gap  # positive = away closed/overtook
            else:
                final_gap_for_trailing = -final_gap

            # "Correct" if trailing team closed gap by at least half or took lead
            comeback_outcomes.append(1 if final_gap_for_trailing > -(gap_at_alert / 2) else 0)

        elif result["swing_warning"]:
            swing_warn_count += 1
            db.store_alert(
                conn, game["id"], "SWING_WARNING",
                ca["v"], ch["v"],
                snap_game["away_score"], snap_game["home_score"],
                ca.get("p"), ca.get("c"),
            )

    total_alerts = bluffing_count + comeback_count + swing_warn_count

    log_entry = {
        "game_id": game["id"],
        "total_alerts": total_alerts,
        "bluffing_count": bluffing_count,
        "comeback_count": comeback_count,
        "swing_warn_count": swing_warn_count,
        "bluff_correct": sum(bluff_outcomes),
        "bluff_total": len(bluff_outcomes),
        "comeback_correct": sum(comeback_outcomes),
        "comeback_total": len(comeback_outcomes),
        "final_away_score": final_away_score,
        "final_home_score": final_home_score,
    }

    if total_alerts > 0:
        db.store_backfill_log(conn, log_entry)

    return log_entry


def run_backfill(league, start_date, end_date):
    """Main backfill entry point."""
    db.init_db()
    conn = db.get_connection()

    total_processed = 0
    total_skipped = 0
    total_alerts = 0

    try:
        for game_id, event, game_date in discover_games(league, start_date, end_date):
            try:
                result = process_game(conn, game_id, event, league, game_date)
                if result is None:
                    total_skipped += 1
                else:
                    total_processed += 1
                    total_alerts += result["total_alerts"]
                    logger.info(
                        "  [%d] %s %s: %d plays, %d alerts (%d bluff, %d comeback, %d swing)",
                        total_processed, league, game_id,
                        result.get("bluff_total", 0) + result.get("comeback_total", 0),
                        result["total_alerts"],
                        result["bluffing_count"], result["comeback_count"], result["swing_warn_count"],
                    )
            except Exception:
                logger.exception("  Failed to process game %s", game_id)

            time.sleep(BACKFILL_DELAY)

    finally:
        conn.close()

    logger.info(
        "Backfill complete: %d processed, %d skipped, %d total alerts",
        total_processed, total_skipped, total_alerts,
    )


def main():
    parser = argparse.ArgumentParser(description="The Swing — Historical Backfill")
    parser.add_argument("--league", choices=["NBA", "CBB"], default="NBA", help="League to backfill")
    parser.add_argument("--start", type=str, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, help="End date (YYYY-MM-DD)")
    args = parser.parse_args()

    start_date = date.fromisoformat(args.start) if args.start else None
    end_date = date.fromisoformat(args.end) if args.end else None

    run_backfill(args.league, start_date, end_date)


if __name__ == "__main__":
    main()
