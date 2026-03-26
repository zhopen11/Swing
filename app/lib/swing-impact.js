/** Compute per-player swing impact from play-by-play data. */

const { resolveTeam, scorePossession, toMomentum } = require('./momentum');
const { WINDOW } = require('./config');

// Minimum play counts for meaningful volatility readings
const MIN_PLAYS_MVIX = 5;
const MIN_PLAYS_MRVI = 8;
const ROLLING_WINDOW = 10;

/**
 * Compute MVIX from a player's chronological possession score sequence.
 * Uses cumulative score as the series and index as the time axis.
 * Returns { mvix, mvixUp, mvixDown, bias } or null if insufficient data.
 */
function computePlayerMvix(plays) {
  const n = plays.length;
  if (n < MIN_PLAYS_MVIX) return null;

  // Build cumulative series
  const cum = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += plays[i];
    cum.push(sum);
  }

  // First derivative (central differences, index = 1 time unit)
  const d1 = [];
  for (let i = 0; i < n; i++) {
    let dv;
    if (i === 0) dv = n > 1 ? cum[1] - cum[0] : 0;
    else if (i === n - 1) dv = cum[n - 1] - cum[n - 2];
    else dv = (cum[i + 1] - cum[i - 1]) / 2;
    d1.push(dv);
  }

  // Recency-weighted std dev of velocity
  let weightedMeanSum = 0, weightTotal = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.exp(3 * (i / (n - 1) - 1));
    weightedMeanSum += d1[i] * w;
    weightTotal += w;
  }
  const weightedMean = weightTotal > 0 ? weightedMeanSum / weightTotal : 0;
  let weightedVarSum = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.exp(3 * (i / (n - 1) - 1));
    weightedVarSum += w * (d1[i] - weightedMean) ** 2;
  }
  const weightedStdDev = Math.sqrt(weightTotal > 0 ? weightedVarSum / weightTotal : 0);

  // RAW_MAX: max single-step velocity ≈ max possession score ≈ 3.0
  const RAW_MAX = 3.0;
  const mvix = Math.min(100, Math.round((weightedStdDev / RAW_MAX) * 100));

  const posVel = d1.filter((v) => v > 0);
  const negVel = d1.filter((v) => v < 0);
  const posStd = posVel.length > 1 ? Math.sqrt(posVel.reduce((s, v) => s + v ** 2, 0) / posVel.length) : 0;
  const negStd = negVel.length > 1 ? Math.sqrt(negVel.reduce((s, v) => s + v ** 2, 0) / negVel.length) : 0;
  const mvixUp = Math.min(100, Math.round((posStd / RAW_MAX) * 100));
  const mvixDown = Math.min(100, Math.round((negStd / RAW_MAX) * 100));

  return { mvix, mvixUp, mvixDown, bias: mvixUp - mvixDown };
}

/**
 * Compute MRVI from a player's possession score sequence.
 * Adapted from Dorsey's RVI: rolling stddev classified by direction,
 * smoothed with Wilder's exponential method.
 * Uses smaller periods than team MRVI given shorter player series.
 */
function computePlayerMrvi(plays, stdPeriod = 6, smoothPeriod = 10) {
  const n = plays.length;
  if (n < stdPeriod + 2) return null;

  const stddevs = new Array(n).fill(0);
  for (let i = stdPeriod - 1; i < n; i++) {
    let s = 0;
    for (let j = i - stdPeriod + 1; j <= i; j++) s += plays[j];
    const mean = s / stdPeriod;
    let variance = 0;
    for (let j = i - stdPeriod + 1; j <= i; j++) variance += (plays[j] - mean) ** 2;
    stddevs[i] = Math.sqrt(variance / stdPeriod);
  }

  const upVol = new Array(n).fill(0);
  const downVol = new Array(n).fill(0);
  for (let i = stdPeriod; i < n; i++) {
    if (plays[i] > plays[i - 1]) upVol[i] = stddevs[i];
    else if (plays[i] < plays[i - 1]) downVol[i] = stddevs[i];
    else { upVol[i] = stddevs[i] / 2; downVol[i] = stddevs[i] / 2; }
  }

  const alpha = 1 / smoothPeriod;
  let smoothUp = upVol[stdPeriod];
  let smoothDown = downVol[stdPeriod];
  for (let i = stdPeriod + 1; i < n; i++) {
    smoothUp = alpha * upVol[i] + (1 - alpha) * smoothUp;
    smoothDown = alpha * downVol[i] + (1 - alpha) * smoothDown;
  }

  const total = smoothUp + smoothDown;
  if (total === 0) return 50;
  return Math.round((100 * smoothUp / total) * 10) / 10;
}

/**
 * Compute player volatility from their full-game possession score sequence.
 * Returns { mvix, mrvi, combo } or null if insufficient data.
 */
function computePlayerVolatility(plays) {
  if (!plays || plays.length < MIN_PLAYS_MVIX) return null;
  const mvixResult = computePlayerMvix(plays);
  if (!mvixResult) return null;
  const mrvi = plays.length >= MIN_PLAYS_MRVI ? computePlayerMrvi(plays) : null;
  const combo = mrvi != null ? Math.round((-mvixResult.mvix + mrvi) * 10) / 10 : null;
  return { mvix: mvixResult.mvix, mrvi, combo };
}

function gameSeconds(point, league) {
  const p = point.p || 1;
  const c = point.c || '0:00';
  const [m, s] = c.split(':').map(Number);
  const periodSecs = league === 'NBA' ? 12 * 60 : 20 * 60;
  return (p - 1) * periodSecs + (periodSecs - ((m || 0) * 60 + (s || 0)));
}

function findInflections(chart, league) {
  const d1 = [];
  for (let i = 0; i < chart.length; i++) {
    const t = gameSeconds(chart[i], league);
    let dv;
    if (i === 0 && chart.length > 1) {
      const dt = gameSeconds(chart[i + 1], league) - t;
      dv = dt > 0 ? (chart[i + 1].v - chart[i].v) / dt : 0;
    } else if (i === chart.length - 1) {
      const dt = t - gameSeconds(chart[i - 1], league);
      dv = dt > 0 ? (chart[i].v - chart[i - 1].v) / dt : 0;
    } else {
      const dt = gameSeconds(chart[i + 1], league) - gameSeconds(chart[i - 1], league);
      dv = dt > 0 ? (chart[i + 1].v - chart[i - 1].v) / dt : 0;
    }
    d1.push({ gameTime: t, v: chart[i].v, dv, idx: i });
  }

  const d2 = [];
  for (let i = 0; i < d1.length; i++) {
    let d2v;
    if (i === 0 && d1.length > 1) {
      d2v = (d1[1].dv - d1[0].dv) / Math.max(1, d1[1].gameTime - d1[0].gameTime);
    } else if (i === d1.length - 1) {
      d2v = (d1[i].dv - d1[i - 1].dv) / Math.max(1, d1[i].gameTime - d1[i - 1].gameTime);
    } else {
      d2v = (d1[i + 1].dv - d1[i - 1].dv) / Math.max(1, d1[i + 1].gameTime - d1[i - 1].gameTime);
    }
    d2.push({ ...d1[i], d2v });
  }

  const inflections = [];
  for (let i = 1; i < d2.length; i++) {
    const prev = d2[i - 1].d2v;
    const curr = d2[i].d2v;
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
      inflections.push({
        idx: d2[i].idx,
        prevIdx: d2[i - 1].idx,
        upward: d2[i].v > d2[i - 1].v,
        magnitude: Math.round(Math.abs(d2[i].v - d2[i - 1].v) * 10) / 10,
        fromMomentum: d2[i - 1].v,
        toMomentum: d2[i].v,
      });
    }
  }
  return inflections;
}

function buildRoster(summary) {
  const roster = {};
  for (const team of summary.boxscore?.players || []) {
    for (const stat of team.statistics || []) {
      for (const athlete of stat.athletes || []) {
        const a = athlete.athlete;
        if (a?.id) roster[a.id] = { name: a.displayName || a.shortName || 'Unknown', jersey: a.jersey || null };
      }
    }
  }
  for (const team of summary.rosters || []) {
    for (const entry of team.roster || []) {
      if (entry.id) {
        const existing = roster[entry.id];
        roster[entry.id] = {
          name: entry.displayName || entry.shortName || existing?.name || 'Unknown',
          jersey: entry.jersey || existing?.jersey || null,
        };
      }
    }
  }
  return roster;
}

function replayMomentumWithPlayers(plays, awayAbbr, homeAbbr, awayId, homeId, league, roster) {
  const teamedPlays = plays.filter((p) => resolveTeam(p.team, awayAbbr, homeAbbr, awayId, homeId));

  const chartAway = [];
  const chartHome = [];
  const awayWindow = [];
  const homeWindow = [];
  const batchPlays = [];
  let currentBatch = [];

  teamedPlays.forEach((play, i) => {
    const team = resolveTeam(play.team, awayAbbr, homeAbbr, awayId, homeId);
    const ps = scorePossession(play);
    const playType = (play.type?.text || '').toLowerCase();

    if (
      ps === 0 &&
      !play.shootingPlay &&
      !playType.includes('rebound') &&
      !playType.includes('turnover') &&
      !playType.includes('steal')
    ) {
      return;
    }

    if (team === awayAbbr) {
      awayWindow.push(ps);
      if (awayWindow.length > WINDOW) awayWindow.shift();
    } else if (team === homeAbbr) {
      homeWindow.push(ps);
      if (homeWindow.length > WINDOW) homeWindow.shift();
    }

    const athleteId = play.participants?.[0]?.athlete?.id;
    let playerName = null;
    let jersey = null;
    if (athleteId && roster[athleteId]) {
      playerName = roster[athleteId].name;
      jersey = roster[athleteId].jersey;
    } else if (play.text) {
      const match = play.text.match(/^([A-Z][a-z''-]+ [A-Z][a-z''-]+)/);
      if (match) {
        // Verify the matched name is a real player in the roster, not a team-level play
        // like "Iowa Offensive Rebound" or "Clemson Deadball Team Rebound"
        const candidate = match[1];
        const rosterEntry = Object.values(roster).find((r) => r.name === candidate);
        if (rosterEntry) {
          playerName = rosterEntry.name;
          jersey = rosterEntry.jersey;
        }
      }
    }

    currentBatch.push({
      player: playerName,
      athleteId: athleteId || null,
      jersey,
      team,
      possessionScore: ps,
      text: play.text || '',
      type: play.type?.text || '',
      period: play.period?.number,
      clock: play.clock?.displayValue,
      awayScore: play.awayScore,
      homeScore: play.homeScore,
    });

    if (i % 5 === 0) {
      const rawAway = awayWindow.reduce((a, b) => a + b, 0);
      const rawHome = homeWindow.reduce((a, b) => a + b, 0);
      chartAway.push({ v: toMomentum(rawAway, league), p: play.period?.number, c: play.clock?.displayValue });
      chartHome.push({ v: toMomentum(rawHome, league), p: play.period?.number, c: play.clock?.displayValue });
      batchPlays.push([...currentBatch]);
      currentBatch = [];
    }
  });

  if (currentBatch.length > 0) {
    batchPlays.push([...currentBatch]);
  }

  return { chartAway, chartHome, batchPlays };
}

/**
 * Check if a play occurred in the clutch window:
 * final 5 minutes of regulation AND score within 12 points.
 */
function isClutchPlay(play, league) {
  if (!play.period || !play.clock) return false;
  const regPeriods = league === 'NBA' ? 4 : 2;
  if (play.period !== regPeriods) return false;
  const [m] = play.clock.split(':').map(Number);
  if ((m || 0) >= 5) return false;
  if (play.awayScore != null && play.homeScore != null) {
    if (Math.abs(play.awayScore - play.homeScore) > 12) return false;
  }
  return true;
}

function computeSwingImpact(inflections, batchPlays, teamAbbr, league) {
  const playerMap = {};
  const swings = [];

  for (const swing of inflections) {
    const startIdx = Math.max(0, swing.prevIdx);
    const endIdx = Math.min(batchPlays.length - 1, swing.idx);

    const windowPlays = [];
    for (let b = startIdx; b <= endIdx; b++) {
      if (batchPlays[b]) windowPlays.push(...batchPlays[b]);
    }

    const teamPlays = windowPlays.filter((p) => p.team === teamAbbr && p.possessionScore !== 0);
    const mag = swing.magnitude || 1;

    swings.push({
      direction: swing.upward ? 'up' : 'down',
      magnitude: swing.magnitude,
      fromMomentum: swing.fromMomentum,
      toMomentum: swing.toMomentum,
      plays: teamPlays.map((p) => ({
        player: p.player,
        impact: Math.round(p.possessionScore * 10) / 10,
        text: p.text,
        period: p.period,
        clock: p.clock,
      })),
    });

    for (const p of teamPlays) {
      if (!p.player) continue;
      if (!playerMap[p.player]) {
        playerMap[p.player] = {
          athleteId: p.athleteId,
          jersey: p.jersey,
          totalImpact: 0,
          weightedImpact: 0,
          swingAppearances: 0,
          positivePlays: 0,
          negativePlays: 0,
          clutchAppearances: 0,
          clutchPositive: 0,
        };
      }
      const entry = playerMap[p.player];
      entry.totalImpact += p.possessionScore;
      entry.weightedImpact += p.possessionScore * mag;
      entry.swingAppearances++;
      if (p.possessionScore > 0) entry.positivePlays++;
      else entry.negativePlays++;
      if (isClutchPlay(p, league)) {
        entry.clutchAppearances++;
        if (p.possessionScore > 0) entry.clutchPositive++;
      }
    }
  }

  // Build full-game possession score sequence per player for MVIX/MRVI
  const playerPlays = {};
  for (const batch of batchPlays) {
    for (const play of batch) {
      if (play.team === teamAbbr && play.player && play.possessionScore !== 0) {
        if (!playerPlays[play.player]) playerPlays[play.player] = [];
        playerPlays[play.player].push(play.possessionScore);
      }
    }
  }

  const leaderboard = Object.entries(playerMap)
    .map(([name, data]) => {
      const vol = computePlayerVolatility(playerPlays[name]);
      return {
        player: name,
        athleteId: data.athleteId,
        jersey: data.jersey,
        totalImpact: Math.round(data.totalImpact * 10) / 10,
        weightedImpact: Math.round(data.weightedImpact * 10) / 10,
        swingAppearances: data.swingAppearances,
        positivePlays: data.positivePlays,
        negativePlays: data.negativePlays,
        efficiency: data.swingAppearances > 0
          ? Math.round((data.positivePlays / data.swingAppearances) * 1000) / 10
          : 0,
        clutchAppearances: data.clutchAppearances,
        clutchPositive: data.clutchPositive,
        mvix: vol?.mvix ?? null,
        mrvi: vol?.mrvi ?? null,
        combo: vol?.combo ?? null,
      };
    })
    .sort((a, b) => b.weightedImpact - a.weightedImpact);

  return { swings, leaderboard };
}

/**
 * High-level: compute swing impact for both teams in a game.
 * Returns null if insufficient data.
 */
function computeGameSwingImpact(plays, summary, game) {
  const roster = buildRoster(summary);
  const { chartAway, chartHome, batchPlays } = replayMomentumWithPlayers(
    plays, game.awayAbbr, game.homeAbbr, game.awayId, game.homeId, game.league, roster
  );

  if (chartAway.length < 3 || chartHome.length < 3) return null;

  const awayInflections = findInflections(chartAway, game.league);
  const homeInflections = findInflections(chartHome, game.league);

  const awayResult = computeSwingImpact(awayInflections, batchPlays, game.awayAbbr, game.league);
  const homeResult = computeSwingImpact(homeInflections, batchPlays, game.homeAbbr, game.league);

  return {
    away: {
      team: game.awayAbbr,
      inflections: awayInflections,
      ...awayResult,
    },
    home: {
      team: game.homeAbbr,
      inflections: homeInflections,
      ...homeResult,
    },
  };
}

module.exports = {
  findInflections,
  buildRoster,
  replayMomentumWithPlayers,
  computeSwingImpact,
  computeGameSwingImpact,
  computePlayerVolatility,
};
