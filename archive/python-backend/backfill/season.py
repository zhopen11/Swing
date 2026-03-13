"""The Swing — Season game discovery for backfill."""

import time
import logging
from datetime import date, timedelta

from backend import espn
from backend.config import BACKFILL_DELAY

logger = logging.getLogger(__name__)

# Season date ranges (2025-26)
NBA_SEASON_START = date(2025, 10, 22)
NBA_SEASON_END = date(2026, 4, 13)
CBB_SEASON_START = date(2025, 11, 3)
CBB_SEASON_END = date(2026, 4, 8)


def discover_games(league, start_date=None, end_date=None):
    """Discover all completed game IDs for a league within a date range.

    Yields (game_id, event_dict, date_str) tuples.
    """
    if league == "NBA":
        default_start = NBA_SEASON_START
        default_end = NBA_SEASON_END
        fetch_fn = espn.fetch_nba_scoreboard
    else:
        default_start = CBB_SEASON_START
        default_end = CBB_SEASON_END
        fetch_fn = espn.fetch_cbb_scoreboard

    start = start_date or default_start
    end = min(end_date or default_end, date.today())

    current = start
    total_days = (end - start).days + 1
    day_count = 0

    while current <= end:
        day_count += 1
        date_str = current.strftime("%Y%m%d")
        logger.info("[%d/%d] Discovering %s games for %s", day_count, total_days, league, current.isoformat())

        events = fetch_fn(date_str)

        final_count = 0
        for event in events:
            status = event.get("status", {}).get("type", {}).get("name", "")
            if status == "STATUS_FINAL":
                game_id = event.get("id", "")
                if game_id:
                    final_count += 1
                    yield game_id, event, current.isoformat()

        logger.info("  Found %d completed games", final_count)

        current += timedelta(days=1)
        time.sleep(BACKFILL_DELAY)
