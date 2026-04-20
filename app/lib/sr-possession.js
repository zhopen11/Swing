/**
 * The Swing — SR Possession Parser (Layer 1)
 *
 * Groups SR play-by-play events into discrete offensive possessions and
 * scores each one for efficiency. This replaces the sliding window of
 * raw events with a sliding window of possession scores.
 *
 * A possession is a complete offensive sequence ending in:
 *   - A shot attempt (made or missed, including free throws)
 *   - A turnover
 *   - End of period
 *
 * Output: array of possession objects, one per offensive sequence.
 * Each possession has a team, an efficiency score, and context flags.
 *
 * Possession score = Shot Quality × Outcome + Sequence Bonus
 */

// ── Shot quality multipliers by action_area ───────────────────────────────────
// SR action_area values confirmed present in cached data (spot check April 10).
// Corner 3s are the most efficient shot in modern basketball.

const SHOT_QUALITY = {
  // 3-point zones
  outsideleft:       1.3,   // corner 3 (left)
  outsideright:      1.3,   // corner 3 (right)
  outsideleftwing:   1.0,   // above the break 3 (left wing)
  outsiderightwing:  1.0,   // above the break 3 (right wing)
  outsidetop:        1.0,   // top of the key 3
  outsidecenter:     1.0,   // above the break 3 (center)

  // 2-point zones
  underbasket:       1.2,   // layup / dunk / putback
  inthepaint:        1.1,   // paint (non-underbasket)
  insideleft:        0.6,   // mid-range (left)
  insideright:       0.6,   // mid-range (right)
  insidecenter:      0.6,   // mid-range (center)
  insideleftwing:    0.65,  // short mid-range wing
  insiderightwing:   0.65,
};

const DEFAULT_SHOT_QUALITY = 0.8; // fallback if action_area missing or unknown

// ── Turnover costs by turnover_type ───────────────────────────────────────────
// Confirmed present via spot check. A steal hurts more than a bad pass —
// the opponent gets live-ball momentum.

const TURNOVER_COST = {
  'Lost Ball':       -2.5,  // steal — opponent gets ball with momentum
  'Bad Pass':        -1.8,  // out of bounds, less demoralizing
  'Traveling':       -1.4,
  'Offensive Foul':  -1.5,
  'Shot Clock':      -1.2,  // poor possession but no live-ball turnover
  'Out of Bounds':   -1.4,
  'Illegal Screen':  -1.3,
  'Double Dribble':  -1.4,
  'Palming':         -1.3,
};

const DEFAULT_TURNOVER_COST = -1.8; // fallback

// ── Sequence bonuses ──────────────────────────────────────────────────────────
// Fast break and second-chance possessions carry extra momentum weight.

const SEQ_BONUS = {
  fastBreakFromTurnover: 2.0,  // steal → immediate score at other end
  fastBreakFromRebound:  1.5,  // defensive board → pushed the pace
  secondChance:          1.0,  // offensive rebound → another chance
  halfCourt:             0.0,  // standard set possession
};

// ── Shot outcome base values ──────────────────────────────────────────────────
// Made shots: actual points scored × quality multiplier (rewards both making
//   the shot AND the quality of the look).
// Missed shots: flat penalty regardless of shot quality — a miss is a miss.
// This ensures scoring rhythm is the primary driver of momentum, with shot
// quality as a modifier on top.

const MISSED_PENALTY = -0.5; // flat — quality doesn't matter on a miss
const FT_MADE        =  0.5; // free throw made (per FT)
const FT_MISSED      = -0.2; // free throw missed

// Normalization range — max expected one-sided weighted advantage over K poss.
// Made corner 3 with fast break: 3 × 1.3 + 2.0 = 5.9 per possession
// Over K=15 possessions (alternating teams, ~8 each) with decay:
// One-sided sum ≈ 5.9 × Σ(0.88^2i for i=0..7) ≈ 5.9 × 4.5 ≈ 26
const RAW_RANGE = 25;

// ── event_type helpers ────────────────────────────────────────────────────────

const SHOT_ENDERS = new Set([
  'twopointmade', 'twopointmiss',
  'threepointmade', 'threepointmiss',
]);

const FT_TYPES = new Set(['freethrowmade', 'freethrowmiss']);

const TURNOVER_TYPE = 'turnover';

function isMade(evType) {
  return evType === 'twopointmade' || evType === 'threepointmade' || evType === 'freethrowmade';
}

function isThree(evType) {
  return evType === 'threepointmade' || evType === 'threepointmiss';
}

function isFastBreak(play) {
  // SR trial tier: `fast_break` boolean not available.
  // Approximate via clock — if shot comes quickly after possession starts
  // (we track elapsed time via wallclock when available).
  // For now, rely on description text as fallback.
  const desc = (play.text || '').toLowerCase();
  return desc.includes('fast break') || desc.includes('fastbreak');
}

function isOffensiveRebound(play) {
  return (play.type?.text || '').toLowerCase().includes('offensive rebound');
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse normalized SR plays (output of normalizePbp) into possession objects.
 *
 * @param {Array}  plays      Normalized play objects from sportradar.normalizePbp()
 * @param {string} awayAlias  e.g. 'MICH'
 * @param {string} homeAlias  e.g. 'DUKE'
 * @param {string} awayId     SR team GUID for away team (from pbpData.away.id)
 * @param {string} homeId     SR team GUID for home team (from pbpData.home.id)
 * @returns {Array} possessions
 *   Each possession: {
 *     team,          // team abbreviation (alias) who had the ball
 *     score,         // efficiency score for this possession (signed float)
 *     made,          // boolean — did they score?
 *     points,        // actual points scored (0 if turnover/miss)
 *     shotQuality,   // quality multiplier applied (null if turnover)
 *     sequenceBonus, // sequence bonus applied
 *     type,          // 'shot' | 'freethrow' | 'turnover' | 'endofperiod'
 *     period,        // period number
 *     clock,         // clock display value at end of possession
 *     isFastBreak,   // boolean
 *     isSecondChance,// boolean
 *   }
 */
function parsePossessions(plays, awayAlias, homeAlias, awayId, homeId) {
  const possessions = [];

  // Build ID → alias map so we can resolve team from SR's attribution ID
  const idToAlias = {};
  if (awayId && awayAlias) idToAlias[awayId] = awayAlias;
  if (homeId && homeAlias) idToAlias[homeId] = homeAlias;

  function resolveTeam(play) {
    // Prefer abbreviation if populated
    if (play.team?.abbreviation) return play.team.abbreviation;
    // Fall back to ID lookup
    if (play.team?.id && idToAlias[play.team.id]) return idToAlias[play.team.id];
    return null;
  }

  let i = 0;
  while (i < plays.length) {
    const play = plays[i];
    const evType = (play.type?.text || '').toLowerCase();
    const rawEvType = evType; // already normalized by normalizePbp

    // Determine possession team
    const team = resolveTeam(play);

    // ── Shot possession ──────────────────────────────────────────────────────
    if (play.shootingPlay && SHOT_ENDERS.has(rawEvType)) {
      const made    = isMade(rawEvType);
      const quality = shotQuality(play);
      const seqBonus = sequenceBonus(plays, i);
      // Only count points for MADE shots
      const shotPts = made ? (play.scoreValue || 0) : 0;
      // Score: made shots = actual points × quality; misses = flat penalty
      const shotScore = made ? (shotPts * quality) : MISSED_PENALTY;

      // Consume any immediately following free throws as part of this possession
      let ftScore = 0;
      let ftPts   = 0;
      let j = i + 1;
      while (j < plays.length && FT_TYPES.has(plays[j].type?.text?.toLowerCase())) {
        const ft   = plays[j];
        const ftMd = isMade(ft.type?.text?.toLowerCase());
        ftScore += ftMd ? FT_MADE : FT_MISSED;
        ftPts   += ftMd ? 1 : 0;
        j++;
      }

      possessions.push({
        team,
        score: shotScore + seqBonus + ftScore,
        made,
        points: shotPts + ftPts,
        shotQuality: quality,
        sequenceBonus: seqBonus,
        type: 'shot',
        period: play.period?.number,
        clock: play.clock?.displayValue,
        isFastBreak: isFastBreak(play),
        isSecondChance: isSecondChance(plays, i),
      });

      i = j;
      continue;
    }

    // ── Free throw only (and-one, technical, etc.) ───────────────────────────
    if (FT_TYPES.has(rawEvType)) {
      let ftScore = 0;
      let ftPts   = 0;
      let ftMade  = false;
      let j = i;
      while (j < plays.length && FT_TYPES.has(plays[j].type?.text?.toLowerCase())) {
        const ft = plays[j];
        const m = isMade(ft.type?.text?.toLowerCase());
        ftScore += m ? FT_MADE : FT_MISSED;
        ftPts   += m ? 1 : 0;
        if (m) ftMade = true;
        j++;
      }

      possessions.push({
        team,
        score: ftScore,
        made: ftMade,
        points: ftPts,
        shotQuality: null,
        sequenceBonus: 0,
        type: 'freethrow',
        period: play.period?.number,
        clock: play.clock?.displayValue,
        isFastBreak: false,
        isSecondChance: false,
      });

      i = j;
      continue;
    }

    // ── Turnover ─────────────────────────────────────────────────────────────
    if (rawEvType === TURNOVER_TYPE) {
      const cost = turnoverCost(play);

      possessions.push({
        team,
        score: cost,
        made: false,
        points: 0,
        shotQuality: null,
        sequenceBonus: 0,
        type: 'turnover',
        period: play.period?.number,
        clock: play.clock?.displayValue,
        isFastBreak: false,
        isSecondChance: false,
      });

      i++;
      continue;
    }

    // ── Defensive events — emit mini-possessions for credit ─────────────────
    // Steals, blocks, and defensive rebounds carry momentum signal that the
    // old sliding-window model captured directly. Adding them here brings
    // the possession model in line with the old model's signal coverage.
    const defType = (play.type?.text || '').toLowerCase();

    if (defType === 'steal') {
      // Steal: credited to the player's team (the defending team)
      if (team) {
        possessions.push({
          team,
          score: 1.8,
          made: false,
          points: 0,
          shotQuality: null,
          sequenceBonus: 0,
          type: 'steal',
          period: play.period?.number,
          clock: play.clock?.displayValue,
          isFastBreak: false,
          isSecondChance: false,
        });
      }
      i++;
      continue;
    }

    if (defType === 'block') {
      if (team) {
        possessions.push({
          team,
          score: 1.2,
          made: false,
          points: 0,
          shotQuality: null,
          sequenceBonus: 0,
          type: 'block',
          period: play.period?.number,
          clock: play.clock?.displayValue,
          isFastBreak: false,
          isSecondChance: false,
        });
      }
      i++;
      continue;
    }

    if (defType === 'defensive rebound') {
      if (team) {
        possessions.push({
          team,
          score: 0.6,
          made: false,
          points: 0,
          shotQuality: null,
          sequenceBonus: 0,
          type: 'defReb',
          period: play.period?.number,
          clock: play.clock?.displayValue,
          isFastBreak: false,
          isSecondChance: false,
        });
      }
      i++;
      continue;
    }

    if (defType === 'offensive rebound') {
      // Offensive rebound: credited to the rebounding team.
      // The old sliding-window model weighted these at +1.5, matching ablation
      // findings that shot+rebounds significantly outperforms shots-only.
      // Note: the subsequent shot also receives a secondChance sequenceBonus (+1.0),
      // so the combined signal for an offensive rebound sequence is 1.5 + 1.0 = 2.5.
      if (team) {
        possessions.push({
          team,
          score: 1.5,
          made: false,
          points: 0,
          shotQuality: null,
          sequenceBonus: 0,
          type: 'offReb',
          period: play.period?.number,
          clock: play.clock?.displayValue,
          isFastBreak: false,
          isSecondChance: false,
        });
      }
      i++;
      continue;
    }

    // Everything else (fouls, timeouts, lineup changes) — skip
    i++;
  }

  return possessions;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shotQuality(play) {
  const area = (play.actionArea || '').toLowerCase().replace(/\s+/g, '');
  return SHOT_QUALITY[area] || DEFAULT_SHOT_QUALITY;
}

function turnoverCost(play) {
  // turnover_type comes through via the statistics array in normalizePbp,
  // stored on the play as type.text = 'turnover'. The specific type is in
  // the description text since normalizePbp doesn't yet extract it separately.
  // Parse it from description as a fallback.
  const desc = (play.text || '');

  // Check common patterns in SR description text
  if (/lost ball|steal/i.test(desc))        return TURNOVER_COST['Lost Ball'];
  if (/bad pass/i.test(desc))               return TURNOVER_COST['Bad Pass'];
  if (/traveling|travel/i.test(desc))       return TURNOVER_COST['Traveling'];
  if (/offensive foul/i.test(desc))         return TURNOVER_COST['Offensive Foul'];
  if (/shot clock/i.test(desc))             return TURNOVER_COST['Shot Clock'];
  if (/out of bounds/i.test(desc))          return TURNOVER_COST['Out of Bounds'];
  if (/illegal screen/i.test(desc))         return TURNOVER_COST['Illegal Screen'];
  if (/double dribble/i.test(desc))         return TURNOVER_COST['Double Dribble'];
  if (/palming/i.test(desc))               return TURNOVER_COST['Palming'];

  return DEFAULT_TURNOVER_COST;
}

function sequenceBonus(plays, shotIdx) {
  // Look back up to 3 plays for context on what led to this possession
  const lookback = Math.max(0, shotIdx - 3);
  for (let k = shotIdx - 1; k >= lookback; k--) {
    const prev = plays[k];
    const prevType = (prev.type?.text || '').toLowerCase();

    if (prevType === 'turnover') {
      // Shot came right after opponent turnover — fast break
      return SEQ_BONUS.fastBreakFromTurnover;
    }

    if (prevType === 'defensive rebound') {
      // Shot came right after defensive rebound — could be fast break
      if (isFastBreak(plays[shotIdx])) return SEQ_BONUS.fastBreakFromRebound;
    }

    if (prevType === 'offensive rebound') {
      // Second chance opportunity
      return SEQ_BONUS.secondChance;
    }
  }

  return SEQ_BONUS.halfCourt;
}

function isSecondChance(plays, shotIdx) {
  const lookback = Math.max(0, shotIdx - 3);
  for (let k = shotIdx - 1; k >= lookback; k--) {
    if ((plays[k].type?.text || '').toLowerCase() === 'offensive rebound') return true;
  }
  return false;
}

// ── Momentum from possessions ─────────────────────────────────────────────────

/**
 * Compute a 0–100 momentum score for each team from a possession array.
 * Uses a single chronological decay window over the last K possessions.
 * The most recent possession has weight 1.0; older ones decay exponentially.
 *
 * @param {Array}  possessions  Output of parsePossessions()
 * @param {string} awayAlias
 * @param {string} homeAlias
 * @param {number} K            Recent possessions to consider (default 15)
 * @param {number} decay        Decay factor per possession back (default 0.88)
 * @returns {{ away: number, home: number }} Normalized 0–100 scores
 */
function computePossessionMomentum(possessions, awayAlias, homeAlias, K = 15, decay = 0.88) {
  if (!possessions.length) return { away: 50, home: 50 };

  const recent = possessions.slice(-K);

  let awayRaw = 0;
  let homeRaw = 0;

  for (let i = 0; i < recent.length; i++) {
    const poss   = recent[i];
    const weight = Math.pow(decay, recent.length - 1 - i); // most recent = 1.0
    const team   = (poss.team || '').toUpperCase();

    if (team === (awayAlias || '').toUpperCase())      awayRaw += poss.score * weight;
    else if (team === (homeAlias || '').toUpperCase()) homeRaw += poss.score * weight;
  }

  // Normalize to 0–100. RAW_RANGE defined at top of file.
  const awayAdv = Math.max(-RAW_RANGE, Math.min(RAW_RANGE, awayRaw - homeRaw));

  const awayScore = 50 + (awayAdv / RAW_RANGE) * 50;
  const homeScore = 100 - awayScore;

  return {
    away: Math.round(Math.max(0, Math.min(100, awayScore))),
    home: Math.round(Math.max(0, Math.min(100, homeScore))),
  };
}

// ── Chart generation ──────────────────────────────────────────────────────────

const MAX_CHART_POINTS = 60;
const CHART_SAMPLE_EVERY = 8; // sample every N plays — ~50 pts for a 400-play game

/**
 * Compute possession-model momentum AND generate chart arrays from the same
 * model, so the sparkline always tells the same story as the alert values.
 *
 * Samples the possession model at every CHART_SAMPLE_EVERY plays. Each sample
 * re-parses possessions from play 0 → play i, then scores them. This is O(n²)
 * in play count but fast in practice (~8,000 light ops for a 400-play game).
 *
 * @param {Array}  plays      Normalized plays (from getPlaysFromSummary or normalizePbp)
 * @param {string} awayAlias
 * @param {string} homeAlias
 * @param {string} awayId
 * @param {string} homeId
 * @param {number} K          Possession window size (default 20)
 * @param {number} decay      Decay factor (default 0.88)
 * @returns {{ away, home, chartAway, chartHome }}
 */
function computePossessionMomentumWithChart(plays, awayAlias, homeAlias, awayId, homeId, K = 20, decay = 0.88) {
  if (!plays || plays.length === 0) {
    return { away: 50, home: 50, chartAway: [], chartHome: [] };
  }

  const rawChartAway = [];
  const rawChartHome = [];

  for (let i = CHART_SAMPLE_EVERY; i < plays.length; i += CHART_SAMPLE_EVERY) {
    const poss = parsePossessions(plays.slice(0, i), awayAlias, homeAlias, awayId, homeId);
    const mom  = computePossessionMomentum(poss, awayAlias, homeAlias, K, decay);
    const play = plays[i - 1];

    rawChartAway.push({
      t: play.wallclock || null,
      p: play.period?.number,
      c: play.clock?.displayValue,
      v: mom.away,
      hs: play.homeScore,
      as: play.awayScore,
    });
    rawChartHome.push({
      t: play.wallclock || null,
      p: play.period?.number,
      c: play.clock?.displayValue,
      v: mom.home,
    });
  }

  // Always include a final point at the last play
  const allPoss  = parsePossessions(plays, awayAlias, homeAlias, awayId, homeId);
  const finalMom = computePossessionMomentum(allPoss, awayAlias, homeAlias, K, decay);
  const lastPlay = plays[plays.length - 1];

  rawChartAway.push({
    t: lastPlay.wallclock || null,
    p: lastPlay.period?.number,
    c: lastPlay.clock?.displayValue,
    v: finalMom.away,
    hs: lastPlay.homeScore,
    as: lastPlay.awayScore,
  });
  rawChartHome.push({
    t: lastPlay.wallclock || null,
    p: lastPlay.period?.number,
    c: lastPlay.clock?.displayValue,
    v: finalMom.home,
  });

  // Trim to MAX_CHART_POINTS (same logic as momentum.js trimChart)
  function trim(arr) {
    if (arr.length <= MAX_CHART_POINTS) return arr;
    const step = arr.length / MAX_CHART_POINTS;
    return Array.from({ length: MAX_CHART_POINTS }, (_, i) => arr[Math.floor(i * step)]);
  }

  return {
    away:      finalMom.away,
    home:      finalMom.home,
    chartAway: trim(rawChartAway),
    chartHome: trim(rawChartHome),
  };
}

module.exports = {
  parsePossessions,
  computePossessionMomentum,
  computePossessionMomentumWithChart,
  SHOT_QUALITY,
  TURNOVER_COST,
  SEQ_BONUS,
};
