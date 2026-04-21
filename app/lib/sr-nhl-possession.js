/**
 * The Swing — SR NHL Possession Model
 *
 * Zone-possession-efficiency momentum model for NHL hockey. Produces
 * 0–100 momentum scores per team and three alert types (SIB, CW, SW)
 * validated against a raw shot count baseline.
 *
 * Architecture: SR NHL PBP events are grouped into zone possession
 * sequences via the top-level `zone` field. Each sequence is scored
 * using xG-weighted shot quality + giveaway/icing penalties. A sliding
 * window of 8 sequences per team with exponential decay normalizes to
 * 0–100. Blocked shots are identified via statistics[].type === 'block'
 * within `shotmissed` events and credited to the defending team.
 */

const XG_BY_AREA = {
  slot:           1.5,
  crease:         1.5,
  downlow:        1.2,
  highslot:       1.0,
  lowleftpoint:   0.7,
  lowrightpoint:  0.7,
  leftpoint:      0.6,
  rightpoint:     0.6,
  point:          0.6,
  neutralzone:    0.2,
  defensivezone:  0.2,
};

const DEFAULT_XG = 0.5;

function shotXg(event) {
  const area = (event.location?.action_area || '').toLowerCase().replace(/\s+/g, '');
  if (area && XG_BY_AREA[area] !== undefined) return XG_BY_AREA[area];
  const dist = event.details?.distance;
  if (dist != null) return Math.max(0.1, 1.5 * (1 - dist / 100));
  return DEFAULT_XG;
}

function isBlockedShot(event) {
  return (event.statistics || []).some(s => s.type === 'block');
}

function getBlockingTeam(event) {
  return (event.statistics || []).find(s => s.type === 'block')?.team ?? null;
}

const FILTER_TYPES = new Set(['substitution', 'gamesetup', 'challenge']);

function parseZonePossessions(events) {
  const sequences = [];
  let current = null;
  // Track last takeaway timestamp per team (for fast-break bonus detection)
  const lastTakeaway = {}; // teamId -> ms timestamp

  function finalize(seq) {
    if (seq && seq.events.length > 0) sequences.push(seq);
  }

  function startSeq(team, ev) {
    const tsSec = ev.wall_clock ? new Date(ev.wall_clock).getTime() : null;
    const teamId = team.id;
    const fromTakeaway = tsSec != null && lastTakeaway[teamId] != null
      ? (tsSec - lastTakeaway[teamId]) <= 8000
      : false;
    return {
      team,
      period: ev.period || null,
      startClock: ev.clock || null,
      endClock: null,
      strength: ev.strength || 'even',
      fromTakeaway,
      events: [],
    };
  }

  for (const ev of events) {
    const type = ev.event_type;
    if (FILTER_TYPES.has(type)) continue;

    // Track takeaway timestamps before processing boundaries
    if (type === 'takeaway') {
      const teamId = ev.attribution?.id;
      if (teamId && ev.wall_clock) {
        lastTakeaway[teamId] = new Date(ev.wall_clock).getTime();
      }
    }

    // Sequence boundaries
    if (type === 'stoppage' || type === 'endperiod') {
      // Include icing stoppages in the sequence before finalizing so scoreZoneSequence can penalize them
      if (current && type === 'stoppage') current.events.push(ev);
      finalize(current);
      current = null;
      continue;
    }

    if (type === 'faceoff') {
      finalize(current);
      current = null;
      // OZ faceoff win starts a new sequence for the winner
      if (ev.zone === 'offensive') {
        const winnerStat = (ev.statistics || []).find(s => s.type === 'faceoff' && s.win);
        // Only start OZ sequence if zone is offensive from the winner's perspective
        // (SR attributes faceoffs to the winner, so attribution.id === winner.id should hold,
        // but this guard makes the intent explicit and handles any edge cases)
        if (winnerStat?.team && ev.attribution?.id === winnerStat.team.id) {
          current = startSeq(winnerStat.team, ev);
        }
      }
      continue;
    }

    const teamId = ev.attribution?.id;
    if (!teamId || ev.zone !== 'offensive') {
      // Attach blocked shot candidates only — shotmissed events from the opposing team
      // may carry statistics[].type === 'block' which scoreZoneSequence credits to the defender
      if (current && ev.event_type === 'shotmissed' && ev.zone === 'defensive'
          && ev.attribution?.id && ev.attribution.id !== current.team.id) {
        current.events.push(ev);
      }
      continue;
    }

    // Zone flip: different team has offensive zone event
    if (current && teamId !== current.team.id) {
      current.endClock = ev.clock || null;
      finalize(current);
      current = startSeq(ev.attribution, ev);
    } else if (!current) {
      current = startSeq(ev.attribution, ev);
    }

    current.events.push(ev);
  }

  finalize(current);
  return sequences;
}

function scoreZoneSequence(sequence) {
  let score = 0;
  let shotCount = 0;
  const defenseCredits = {}; // teamId -> credit score

  for (const ev of sequence.events) {
    const type = ev.event_type;

    if (type === 'goal') {
      score += 3.0;
      if (shotCount > 0) score += 0.3; // sustained pressure
      shotCount++;
    } else if (type === 'shotsaved') {
      const xg = shotXg(ev);
      score += xg;
      if (shotCount > 0) score += 0.3;
      shotCount++;
    } else if (type === 'shotmissed') {
      if (isBlockedShot(ev)) {
        const blockTeam = getBlockingTeam(ev);
        if (blockTeam) {
          defenseCredits[blockTeam.id] = (defenseCredits[blockTeam.id] || 0) + 0.5;
        }
        // No shot count increment — a blocked shot is a defensive play, not a sustained
        // pressure event. A blocked shot followed by a save should not earn the +0.3 bonus.
      } else {
        const xg = shotXg(ev);
        score += xg * 0.4;
        if (shotCount > 0) score += 0.3;
        shotCount++;
      }
    } else if (type === 'giveaway') {
      score += ev.zone === 'defensive' ? -1.5 : -1.0;
    } else if (type === 'stoppage' && ev.stoppage_type === 'icing') {
      score -= 0.5;
    }
  }

  // Takeaway fast-break bonus
  if (sequence.fromTakeaway) score += 1.5;

  return { score, defenseCredits };
}

const WINDOW_SIZE = 8;
const DECAY = 0.75;

function computeZoneMomentum(homeTeamId, awayTeamId, scoredSequences, windowSize = WINDOW_SIZE) {
  if (!scoredSequences.length) return { home: 50, away: 50 };

  const homeScores = [];
  const awayScores = [];

  for (const seq of scoredSequences) {
    const isHome = seq.team.id === homeTeamId;
    const isAway = seq.team.id === awayTeamId;

    if (isHome) homeScores.push(seq.score);
    if (isAway) awayScores.push(seq.score);

    // Defense credits go to the credited team's window as a bonus entry
    for (const [teamId, credit] of Object.entries(seq.defenseCredits || {})) {
      if (teamId === homeTeamId) homeScores.push(credit);
      if (teamId === awayTeamId) awayScores.push(credit);
    }
  }

  function decayedSum(scores) {
    const window = scores.slice(-windowSize);
    let sum = 0;
    const n = window.length;
    for (let i = 0; i < n; i++) {
      const age = n - 1 - i;
      sum += window[i] * Math.pow(DECAY, age);
    }
    return Math.max(0, sum);
  }

  const homeRaw = decayedSum(homeScores);
  const awayRaw = decayedSum(awayScores);
  const total = homeRaw + awayRaw;

  if (total === 0) return { home: 50, away: 50 };

  const home = Math.round((homeRaw / total) * 100);
  return { home, away: 100 - home };
}

function detectAlerts(homeScore, awayScore, homeGoals, awayGoals, homeStrength, awayStrength) {
  const alerts = [];
  const goalDiff = homeGoals - awayGoals;   // positive = home leads
  const momDiff  = homeScore - awayScore;   // positive = home leads momentum

  // Score Is Bluffing: score leader ≠ momentum leader by ≥10
  if (goalDiff > 0 && momDiff <= -10)
    alerts.push({ type: 'SIB', leader: 'away', momentumGap: -momDiff });
  else if (goalDiff < 0 && momDiff >= 10)
    alerts.push({ type: 'SIB', leader: 'home', momentumGap: momDiff });

  // Comeback Watch: down ≥2 goals, momentum lead ≥15
  if (goalDiff >= 2 && momDiff <= -15) {
    const flag = homeStrength === 'shorthanded' ? 'SH' : null;
    alerts.push({ type: 'CW', team: 'away', momentumLead: -momDiff, flag });
  } else if (goalDiff <= -2 && momDiff >= 15) {
    const flag = awayStrength === 'shorthanded' ? 'SH' : null;
    alerts.push({ type: 'CW', team: 'home', momentumLead: momDiff, flag });
  }

  // Swing Warning: score gap ≤1 goal, momentum gap ≥15
  if (Math.abs(goalDiff) <= 1 && Math.abs(momDiff) >= 15)
    alerts.push({ type: 'SW', leader: momDiff > 0 ? 'home' : 'away', momentumGap: Math.abs(momDiff) });

  return alerts;
}

// ── High-Danger Shot Rate momentum (validated primary model) ─────────────────

const HD_AREAS    = new Set(['slot', 'crease', 'downlow']);
const SHOT_EVTS   = new Set(['goal', 'shotsaved', 'shotmissed']);
const HD_FILTER   = new Set(['substitution', 'gamesetup', 'challenge']);
const HD_WIN_MS   = 3 * 60 * 1000; // 3-minute rolling window
const HD_SAMPLE   = 30;            // chart sample every N filtered events
const MAX_CHART   = 60;

/**
 * Compute HDSR momentum from an event slice.
 * Weights slot/crease/downlow shots 10x over perimeter attempts.
 * Uses a 3-minute wall_clock rolling window.
 */
function hdsrMomentum(events, homeTeamId, awayTeamId) {
  const last = events[events.length - 1];
  const curTime = last?.wall_clock ? new Date(last.wall_clock).getTime() : null;
  let home = 0, away = 0;

  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (!SHOT_EVTS.has(ev.event_type)) continue;
    if (curTime && ev.wall_clock) {
      if (curTime - new Date(ev.wall_clock).getTime() > HD_WIN_MS) break;
    }
    const area   = (ev.location?.action_area || '').toLowerCase();
    const weight = HD_AREAS.has(area) ? 1.0 : 0.1;
    const id     = ev.attribution?.id;
    if (id === homeTeamId) home += weight;
    else if (id === awayTeamId) away += weight;
  }

  const total = home + away;
  if (total < 0.2) return { home: 50, away: 50 };
  return { home: Math.round((home / total) * 100), away: Math.round((away / total) * 100) };
}

/**
 * Compute HDSR momentum + chart arrays for a full game.
 * Returns { home, away, chartHome, chartAway } matching the basketball chart shape.
 */
function hdsrMomentumWithChart(events, homeTeamId, awayTeamId) {
  const filtered = events.filter(e => !HD_FILTER.has(e.event_type));
  const chartHome = [];
  const chartAway = [];

  for (let i = HD_SAMPLE; i < filtered.length; i += HD_SAMPLE) {
    const mom = hdsrMomentum(filtered.slice(0, i + 1), homeTeamId, awayTeamId);
    const ev  = filtered[i];
    chartHome.push({ v: mom.home, p: ev.period, c: ev.clock, t: ev.wall_clock, hs: ev.home_points, as: ev.away_points });
    chartAway.push({ v: mom.away, p: ev.period, c: ev.clock, t: ev.wall_clock });
  }

  const finalMom = hdsrMomentum(filtered, homeTeamId, awayTeamId);
  const last = filtered[filtered.length - 1];
  if (last) {
    chartHome.push({ v: finalMom.home, p: last.period, c: last.clock, t: last.wall_clock, hs: last.home_points, as: last.away_points });
    chartAway.push({ v: finalMom.away, p: last.period, c: last.clock, t: last.wall_clock });
  }

  function trim(arr) {
    if (arr.length <= MAX_CHART) return arr;
    const step = arr.length / MAX_CHART;
    return Array.from({ length: MAX_CHART }, (_, i) => arr[Math.floor(i * step)]);
  }

  return { home: finalMom.home, away: finalMom.away, chartHome: trim(chartHome), chartAway: trim(chartAway) };
}

module.exports = {
  shotXg, isBlockedShot, getBlockingTeam,
  parseZonePossessions, scoreZoneSequence,
  computeZoneMomentum, detectAlerts,
  hdsrMomentum, hdsrMomentumWithChart,
};
