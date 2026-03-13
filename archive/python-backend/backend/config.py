"""The Swing — Configuration constants."""

import os

DB_PATH = os.environ.get("SWING_DB", os.path.join(os.path.dirname(__file__), "..", "swing.db"))

POLL_INTERVAL = 20  # seconds

# ESPN API endpoints
NBA_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
CBB_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
NBA_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={game_id}"
CBB_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event={game_id}"

# Momentum engine
WINDOW = 12
MAX_CHART_POINTS = 60

WEIGHTS = {
    "make3": 3.0,
    "miss3": -1.2,
    "make2": 2.0,
    "miss2": -0.8,
    "makeFT": 0.8,
    "missFT": -0.4,
    "turnover": -2.5,
    "steal": 1.8,
    "block": 1.2,
    "offReb": 1.5,
    "defReb": 0.6,
    "foul": -0.3,
    "fastBreak": 2.5,
}

# Normalization range
RAW_MIN = -15
RAW_MAX = 15
NORM_MIN = 5
NORM_MAX = 95

# Alert thresholds [in-game, halftime]
ALERT_THRESHOLDS = {
    "bluff_mom":      {"live": 10, "ht": 4},
    "bluff_score":    {"live": 4,  "ht": 2},
    "comeback_mom":   {"live": 6,  "ht": 4},
    "comeback_score": {"live": 5,  "ht": 3},
    "swing_gap":      35,
}

LIVE_STATUSES = {"STATUS_IN_PROGRESS", "STATUS_HALFTIME"}

# Backfill rate limiting
BACKFILL_DELAY = 1.5  # seconds between ESPN requests during backfill
