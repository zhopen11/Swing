/** The Swing — Alert detection (three-tier system). */
const { ALERT_THRESHOLDS, LIVE_STATUSES } = require('./config');

/**
 * Parse a clock string like "2:30" or "0:45" into total seconds.
 * Returns null if the clock string is missing or unparseable.
 */
function clockToSeconds(clockStr) {
  if (!clockStr || typeof clockStr !== 'string') return null;
  const parts = clockStr.split(':');
  if (parts.length !== 2) return null;
  const mins = parseInt(parts[0], 10);
  const secs = parseInt(parts[1], 10);
  if (isNaN(mins) || isNaN(secs)) return null;
  return mins * 60 + secs;
}

/**
 * Returns true if this game situation is too far gone for a Comeback Watch
 * to be meaningful. Two rules:
 *
 *   1. 2nd half, ≤ 2:30 remaining, deficit ≥ 20 pts  → suppress
 *   2. 2nd half, ≤ 1:00 remaining, deficit ≥ 12 pts  → suppress
 *
 * Both rules only apply to the 2nd half (period === 2 for CBB,
 * period === 4 for NBA). OT is excluded — anything can happen in OT.
 */
function isLateGameHopeless(game, absScoreDiff) {
  const period = game.period;
  const clockSecs = clockToSeconds(game.clock);
  if (clockSecs === null) return false;

  // Determine if we're in the final regulation period
  // CBB: period 2 is the 2nd half. NBA: period 4 is the 4th quarter.
  const isFinalRegPeriod =
    (game.league === 'CBB' && period === 2) ||
    (game.league === 'NBA' && period === 4);

  if (!isFinalRegPeriod) return false;

  // Rule 1: ≤ 2:30 left and down 20+
  if (clockSecs <= 150 && absScoreDiff >= 20) return true;

  // Rule 2: ≤ 1:00 left and down 12+
  if (clockSecs <= 60 && absScoreDiff >= 12) return true;

  return false;
}

function detectAlerts(game) {
  const mom = game.mom;
  if (!mom) return { bluffing: false, comeback: false, swingWarning: false };

  const { away, home } = mom;
  const swingGap = Math.abs(away - home);
  const scoreDiff = game.awayScore - game.homeScore;
  const absScoreDiff = Math.abs(scoreDiff);
  const awayLeadsScore = scoreDiff > 0;
  const awayLeadsSwing = away > home;
  const isLive = LIVE_STATUSES.has(game.status);
  const isHT = game.status === 'STATUS_HALFTIME';

  const ctx = isHT ? 'ht' : 'live';
  const bluffMomThresh   = ALERT_THRESHOLDS.bluff_mom[ctx];
  const bluffScoreThresh = ALERT_THRESHOLDS.bluff_score[ctx];
  const comebackMomLead  = ALERT_THRESHOLDS.comeback_mom[ctx];
  const comebackScoreGap = ALERT_THRESHOLDS.comeback_score[ctx];

  // Tier 1: SCORE IS BLUFFING
  const bluffing =
    isLive &&
    swingGap >= bluffMomThresh &&
    absScoreDiff >= bluffScoreThresh &&
    awayLeadsScore !== awayLeadsSwing;

  // Tier 2: COMEBACK WATCH
  const trailingLeadsSwing =
    scoreDiff > 0
      ? home > away + comebackMomLead
      : away > home + comebackMomLead;

  const comeback =
    isLive &&
    !bluffing &&
    absScoreDiff >= comebackScoreGap &&
    trailingLeadsSwing &&
    !isLateGameHopeless(game, absScoreDiff); // ← new suppression check

  // Tier 3: SWING WARNING
  const swingWarning =
    isLive &&
    !bluffing &&
    !comeback &&
    absScoreDiff < bluffScoreThresh &&
    swingGap >= ALERT_THRESHOLDS.swing_gap;

  return { bluffing, comeback, swingWarning };
}

module.exports = { detectAlerts };
