/** The Swing — Configuration constants. */

module.exports = {
  POLL_INTERVAL: 10, // seconds

  // ESPN API endpoints
  NBA_SCOREBOARD: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  CBB_SCOREBOARD:
    'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard',
  NBA_SUMMARY: (id) =>
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`,
  CBB_SUMMARY: (id) =>
    `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${id}`,

  // Momentum engine
  WINDOW: 12,
  MAX_CHART_POINTS: 60,

  WEIGHTS: {
    make3: 3.0,
    miss3: -1.2,
    make2: 2.0,
    miss2: -0.8,
    makeFT: 0.8,
    missFT: -0.4,
    turnover: -2.5,
    steal: 1.8,
    block: 1.2,
    offReb: 1.5,
    defReb: 0.6,
    foul: -0.3,
    fastBreak: 2.5,
  },

  // Normalization range (CBB)
  RAW_MIN: -15,
  RAW_MAX: 15,
  // NBA wider raw range — higher shooting %, more 3s, fewer turnovers
  NBA_RAW_MIN: -22,
  NBA_RAW_MAX: 22,
  NORM_MIN: 5,
  NORM_MAX: 95,

  // Alert thresholds
  ALERT_THRESHOLDS: {
    bluff_mom: { live: 10, ht: 4 },
    bluff_score: { live: 4, ht: 2 },
    comeback_mom: { live: 6, ht: 4 },
    comeback_score: { live: 5, ht: 3 },
    swing_gap: 35,
  },

  LIVE_STATUSES: new Set(['STATUS_IN_PROGRESS', 'STATUS_HALFTIME']),

  // Backfill rate limiting
  BACKFILL_DELAY: 1500, // ms between ESPN requests during backfill
};
