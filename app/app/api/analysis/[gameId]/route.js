/** /api/analysis/[gameId]?date=YYYYMMDD — Computes first and second derivatives of momentum for a game. */

const {
  fetchNbaScoreboard,
  fetchCbbScoreboard,
  fetchGameSummary,
  parseScoreboardEvent,
  getPlaysFromSummary,
} = require('../../../../lib/espn');

const { computeMomentumFromPlays } = require('../../../../lib/momentum');

export const dynamic = 'force-dynamic';

// Convert period + clock to total game seconds elapsed
function gameSeconds(point, league) {
  const p = point.p || 1;
  const c = point.c || '0:00';
  const [m, s] = c.split(':').map(Number);
  const clockSecs = (m || 0) * 60 + (s || 0);
  const periodSecs = league === 'NBA' ? 12 * 60 : 20 * 60;
  return (p - 1) * periodSecs + (periodSecs - clockSecs);
}

// Compute first derivative (rate of change) using central differences
function firstDerivative(chart, league) {
  const result = [];
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
    result.push({
      t: chart[i].t,
      p: chart[i].p,
      c: chart[i].c,
      gameTime: t,
      v: chart[i].v,
      dv: Math.round(dv * 1000) / 1000, // momentum per second
    });
  }
  return result;
}

// Compute second derivative (acceleration) from first derivative
function secondDerivative(d1) {
  const result = [];
  for (let i = 0; i < d1.length; i++) {
    let d2v;
    if (i === 0 && d1.length > 1) {
      const dt = d1[i + 1].gameTime - d1[i].gameTime;
      d2v = dt > 0 ? (d1[i + 1].dv - d1[i].dv) / dt : 0;
    } else if (i === d1.length - 1) {
      const dt = d1[i].gameTime - d1[i - 1].gameTime;
      d2v = dt > 0 ? (d1[i].dv - d1[i - 1].dv) / dt : 0;
    } else {
      const dt = d1[i + 1].gameTime - d1[i - 1].gameTime;
      d2v = dt > 0 ? (d1[i + 1].dv - d1[i - 1].dv) / dt : 0;
    }
    result.push({
      ...d1[i],
      d2v: Math.round(d2v * 10000) / 10000, // acceleration per second²
    });
  }
  return result;
}

// Format game seconds to MM:SS
function formatGameTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(Math.round(s)).padStart(2, '0')}`;
}

// Convert a scored play's period + clock to game seconds
function playGameSeconds(play, league) {
  const p = play.period || 1;
  const c = play.clock || '0:00';
  const [m, s] = c.split(':').map(Number);
  const clockSecs = (m || 0) * 60 + (s || 0);
  const periodSecs = league === 'NBA' ? 12 * 60 : 20 * 60;
  return (p - 1) * periodSecs + (periodSecs - clockSecs);
}

// Find the closest scored play index by game time
function findClosestPlayIdx(scoredPlays, targetSecs, league) {
  let closest = 0;
  let closestDist = Infinity;
  for (let i = 0; i < scoredPlays.length; i++) {
    const dist = Math.abs(playGameSeconds(scoredPlays[i], league) - targetSecs);
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }
  return closest;
}

// Find inflection points where second derivative crosses zero
function findInflections(analysis, scoredPlays, league) {
  const inflections = [];
  for (let i = 1; i < analysis.length; i++) {
    const prev = analysis[i - 1].d2v;
    const curr = analysis[i].d2v;
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
      const upward = analysis[i].v > analysis[i - 1].v;

      // Find surrounding plays
      let plays = [];
      if (scoredPlays && scoredPlays.length > 0) {
        const closestIdx = findClosestPlayIdx(scoredPlays, analysis[i].gameTime, league);
        const startIdx = Math.max(0, closestIdx - 3);
        const endIdx = Math.min(scoredPlays.length - 1, closestIdx + 3);
        plays = scoredPlays.slice(startIdx, endIdx + 1).map((p, j) => ({
          period: p.period,
          clock: p.clock,
          team: p.teamAbbr,
          text: p.playText,
          type: p.playType,
          awayScore: p.awayScore,
          homeScore: p.homeScore,
          scoreValue: p.scoreValue,
          isInflectionPlay: (startIdx + j) === closestIdx,
        }));
      }

      inflections.push({
        period: analysis[i].p,
        clock: analysis[i].c,
        elapsedTime: formatGameTime(analysis[i].gameTime),
        elapsedSeconds: analysis[i].gameTime,
        momentum: analysis[i].v,
        upward,
        plays,
      });
    }
  }
  return inflections;
}

// Compute Momentum Volatility Index (MVIX)
function computeVolatility(d1Series, d2Series, inflections) {
  const n = d1Series.length;
  if (n < 2) return null;

  const upInflections = inflections.filter((i) => i.upward);
  const downInflections = inflections.filter((i) => !i.upward);

  // Average magnitude of momentum change at inflections
  const avgUpMagnitude = upInflections.length > 0
    ? upInflections.reduce((sum, inf, idx) => {
        // Find the momentum delta around this inflection
        const i = d2Series.findIndex((p) => p.gameTime === inf.elapsedSeconds);
        if (i > 0) return sum + Math.abs(d2Series[i].v - d2Series[i - 1].v);
        return sum;
      }, 0) / upInflections.length
    : 0;

  const avgDownMagnitude = downInflections.length > 0
    ? downInflections.reduce((sum, inf) => {
        const i = d2Series.findIndex((p) => p.gameTime === inf.elapsedSeconds);
        if (i > 0) return sum + Math.abs(d2Series[i].v - d2Series[i - 1].v);
        return sum;
      }, 0) / downInflections.length
    : 0;

  // Standard deviation of velocity (first derivative) — raw choppiness
  const velocities = d1Series.map((p) => p.dv);
  const meanVel = velocities.reduce((a, b) => a + b, 0) / n;
  const variance = velocities.reduce((sum, v) => sum + (v - meanVel) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  // Exponentially weighted std dev (recent 5 min weighted heavier)
  const totalTime = d1Series[n - 1].gameTime;
  const decayWindow = 5 * 60; // 5 minutes
  let weightedSum = 0;
  let weightedMeanSum = 0;
  let weightTotal = 0;
  for (let i = 0; i < n; i++) {
    const recency = d1Series[i].gameTime / totalTime; // 0 to 1
    const weight = Math.exp(3 * (recency - 1)); // exponential decay, recent = higher
    weightedMeanSum += velocities[i] * weight;
    weightTotal += weight;
  }
  const weightedMean = weightTotal > 0 ? weightedMeanSum / weightTotal : 0;
  for (let i = 0; i < n; i++) {
    const recency = d1Series[i].gameTime / totalTime;
    const weight = Math.exp(3 * (recency - 1));
    weightedSum += weight * (velocities[i] - weightedMean) ** 2;
  }
  const weightedVariance = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const weightedStdDev = Math.sqrt(weightedVariance);

  // Normalize MVIX to 0-100
  // Empirical bounds: stdDev of ~0 = calm, ~0.5 = extremely volatile
  const RAW_MAX = 0.4;
  const mvix = Math.min(100, Math.round((weightedStdDev / RAW_MAX) * 100));

  // Directional MVIX — split velocities into positive and negative
  const posVelocities = velocities.filter((v) => v > 0);
  const negVelocities = velocities.filter((v) => v < 0);

  const posStdDev = posVelocities.length > 1
    ? Math.sqrt(posVelocities.reduce((s, v) => s + v ** 2, 0) / posVelocities.length)
    : 0;
  const negStdDev = negVelocities.length > 1
    ? Math.sqrt(negVelocities.reduce((s, v) => s + v ** 2, 0) / negVelocities.length)
    : 0;

  const mvixUp = Math.min(100, Math.round((posStdDev / RAW_MAX) * 100));
  const mvixDown = Math.min(100, Math.round((negStdDev / RAW_MAX) * 100));
  const bias = mvixUp - mvixDown;

  return {
    upInflections: upInflections.length,
    downInflections: downInflections.length,
    avgUpMagnitude: Math.round(avgUpMagnitude * 100) / 100,
    avgDownMagnitude: Math.round(avgDownMagnitude * 100) / 100,
    volatility: Math.round(stdDev * 10000) / 10000,
    mvix,
    mvixUp,
    mvixDown,
    bias,
  };
}

// Find a game by ID — check today's poll cache first, then fetch by date
async function findGame(gameId, dateStr, origin) {
  // Try today's poll cache first (fast path)
  if (!dateStr) {
    try {
      const pollRes = await fetch(`${origin}/api/poll`);
      const pollData = await pollRes.json();
      const game = pollData.games?.find((g) => g.id === gameId);
      if (game && game.mom) return game;
    } catch {}
  }

  // Fetch scoreboards for the given date (or today)
  const [nbaEvents, cbbEvents] = await Promise.all([
    fetchNbaScoreboard(dateStr || undefined),
    fetchCbbScoreboard(dateStr || undefined),
  ]);

  const allEvents = [
    ...nbaEvents.map((e) => ({ ...e, league: 'NBA' })),
    ...cbbEvents.map((e) => ({ ...e, league: 'CBB' })),
  ];

  const event = allEvents.find((e) => e.id === gameId);
  if (!event) return null;

  const game = parseScoreboardEvent(event, event.league);

  // Fetch play-by-play and compute momentum
  const summary = await fetchGameSummary(game.id, game.league);
  const plays = getPlaysFromSummary(summary);
  if (plays.length > 0) {
    game.mom = computeMomentumFromPlays(
      plays,
      game.awayAbbr,
      game.homeAbbr,
      game.awayId,
      game.homeId,
      game.league
    );
  }

  return game;
}

export async function GET(request, { params }) {
  try {
    const { gameId } = await params;
    const url = new URL(request.url);
    const dateStr = url.searchParams.get('date') || null;
    const origin = url.origin;

    const game = await findGame(gameId, dateStr, origin);
    if (!game) {
      return Response.json({ error: 'Game not found' }, { status: 404 });
    }
    if (!game.mom) {
      return Response.json({ error: 'No momentum data for this game' }, { status: 404 });
    }

    const { chartAway, chartHome, scoredPlays } = game.mom;
    const league = game.league;

    // Away team analysis
    const awayD1 = firstDerivative(chartAway, league);
    const awayD2 = secondDerivative(awayD1);
    const awayInflections = findInflections(awayD2, scoredPlays, league);

    // Home team analysis
    const homeD1 = firstDerivative(chartHome, league);
    const homeD2 = secondDerivative(homeD1);
    const homeInflections = findInflections(homeD2, scoredPlays, league);

    // Current state summary
    const awayLast = awayD2[awayD2.length - 1];
    const homeLast = homeD2[homeD2.length - 1];

    // Volatility analysis
    const awayVolatility = computeVolatility(awayD1, awayD2, awayInflections);
    const homeVolatility = computeVolatility(homeD1, homeD2, homeInflections);

    return Response.json({
      gameId,
      name: game.name,
      status: game.status,
      league,
      score: { away: game.awayScore, home: game.homeScore },
      away: {
        team: game.awayAbbr,
        current: {
          momentum: awayLast?.v,
          velocity: awayLast?.dv,
          acceleration: awayLast?.d2v,
        },
        volatility: awayVolatility,
        series: awayD2,
        inflections: awayInflections,
      },
      home: {
        team: game.homeAbbr,
        current: {
          momentum: homeLast?.v,
          velocity: homeLast?.dv,
          acceleration: homeLast?.d2v,
        },
        volatility: homeVolatility,
        series: homeD2,
        inflections: homeInflections,
      },
    });
  } catch (err) {
    console.error('Analysis error:', err);
    return Response.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
