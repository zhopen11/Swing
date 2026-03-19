/** /api/poll — fetches ESPN scoreboards + play-by-play, computes momentum & alerts, returns everything. */

const {
  fetchNbaScoreboard,
  fetchCbbScoreboard,
  fetchGameSummary,
  parseScoreboardEvent,
  getPlaysFromSummary,
} = require('../../../lib/espn');

const { computeMomentumFromPlays } = require('../../../lib/momentum');
const { detectAlerts } = require('../../../lib/alerts');
import { computeGameVolatility } from '../../../lib/mvix';
import { recordGameMvix, getRolling3Excluding } from '../../../lib/team-mvix';
import { logAlert, getAlertLogs } from '../../../lib/alert-logs';

const LIVE_STATUSES = new Set(['STATUS_IN_PROGRESS', 'STATUS_HALFTIME']);
const CACHE_TTL = 10_000; // 10 seconds

let cachedResponse = null;
let cacheTimestamp = 0;
let fetchInFlight = null;
const finalMomCache = new Map(); // gameId -> momentum data (never changes once final)
const rolling3Cache = new Map(); // gameId -> { away, home } rolling 3-game MVIX

// Separate cache for historical date requests
const historicalCache = new Map(); // dateStr -> { data, timestamp }
const HISTORICAL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for historical data

export const dynamic = 'force-dynamic';

async function buildPollData(dateStr) {
  const [nbaEvents, cbbEvents] = await Promise.all([
    fetchNbaScoreboard(dateStr || undefined),
    fetchCbbScoreboard(dateStr || undefined),
  ]);

  const allEvents = [
    ...nbaEvents.map((e) => ({ ...e, league: 'NBA' })),
    ...cbbEvents.map((e) => ({ ...e, league: 'CBB' })),
  ];

  // Sort: live first, then upcoming, then final
  const sortOrder = {
    STATUS_IN_PROGRESS: 0,
    STATUS_HALFTIME: 0,
    STATUS_SCHEDULED: 1,
    STATUS_FINAL: 2,
  };
  allEvents.sort(
    (a, b) =>
      (sortOrder[a.status?.type?.name] ?? 3) -
      (sortOrder[b.status?.type?.name] ?? 3)
  );

  // Parse all events into game objects
  const games = allEvents.map((e) => parseScoreboardEvent(e, e.league));

  // For live games, fetch play-by-play in parallel
  const detailPromises = games.map(async (g) => {
    const needDetail =
      LIVE_STATUSES.has(g.status) ||
      (g.status === 'STATUS_FINAL' && g.period >= 2);

    if (needDetail) {
      // Use cached momentum for final games
      if (g.status === 'STATUS_FINAL' && finalMomCache.has(g.id)) {
        g.mom = finalMomCache.get(g.id);
      } else {
        const summary = await fetchGameSummary(g.id, g.league);
        const plays = getPlaysFromSummary(summary);
        if (plays.length > 0) {
          g.mom = computeMomentumFromPlays(
            plays,
            g.awayAbbr,
            g.homeAbbr,
            g.awayId,
            g.homeId,
            g.league
          );
          // Cache momentum permanently once game is final
          if (g.status === 'STATUS_FINAL') {
            finalMomCache.set(g.id, g.mom);
          }
        }
      }
    }

    // Compute live MVIX for games with momentum data
    if (g.mom?.chartAway && g.mom?.chartHome) {
      const vol = computeGameVolatility(g.mom.chartAway, g.mom.chartHome, g.league);
      if (vol) {
        g.mvixAway = vol.away;
        g.mvixHome = vol.home;
      }
    }

    // Attach historical 3-game rolling MVIX (cached per game)
    if (g.mom && !rolling3Cache.has(g.id)) {
      try {
        const [awayR, homeR] = await Promise.all([
          getRolling3Excluding(g.awayAbbr, g.league, g.id),
          getRolling3Excluding(g.homeAbbr, g.league, g.id),
        ]);
        rolling3Cache.set(g.id, { away: awayR, home: homeR });
      } catch {}
    }
    const r3 = rolling3Cache.get(g.id);
    if (r3) {
      g.rolling3Away = r3.away;
      g.rolling3Home = r3.home;
    }

    const alerts = detectAlerts(g);
    g.bluffing = alerts.bluffing;
    g.comeback = alerts.comeback;
    g.swingWarning = alerts.swingWarning;

    // Fire-and-forget: log active alerts
    const activeAlerts = ['bluffing', 'comeback', 'swingWarning'].filter(t => g[t]);
    if (activeAlerts.length > 0) {
      Promise.all(activeAlerts.map(t => logAlert(g, t))).catch(err =>
        console.error('Alert log error:', err.message)
      );
    }

    // Attach alert history for games with momentum data
    try {
      g.alertLogs = await getAlertLogs(g.id);
    } catch { g.alertLogs = []; }

    return g;
  });

  const resolvedGames = await Promise.all(detailPromises);
  const timestamp = new Date().toISOString();

  // Fire-and-forget: record MVIX for live and final games
  recordGamesMvix(resolvedGames).catch((err) =>
    console.error('MVIX record error:', err)
  );

  return { games: resolvedGames, timestamp };
}

const mvixLiveRecorded = new Set(); // games where initial live MVIX was saved
const mvixFinalized = new Set();   // games where final MVIX was saved

async function recordGamesMvix(games) {
  for (const g of games) {
    if (!g.mom?.chartAway || !g.mom?.chartHome) continue;

    const isLive = LIVE_STATUSES.has(g.status);
    const isFinal = g.status === 'STATUS_FINAL';
    if (!isLive && !isFinal) continue;

    const gameKey = g.id;

    // Skip if already finalized
    if (mvixFinalized.has(gameKey)) continue;
    // Skip live games already recorded (only record once at game start)
    if (isLive && mvixLiveRecorded.has(gameKey)) continue;

    try {
      const vol = computeGameVolatility(g.mom.chartAway, g.mom.chartHome, g.league);
      if (!vol?.away || !vol?.home) continue;

      const gameDate = g.gameDate || g.date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
      const awayWon = isFinal ? g.awayScore > g.homeScore : null;
      const homeWon = isFinal ? g.homeScore > g.awayScore : null;

      await Promise.all([
        recordGameMvix(g.awayAbbr, g.league, g.id, gameDate, awayWon, `${g.awayScore}-${g.homeScore}`, vol.away),
        recordGameMvix(g.homeAbbr, g.league, g.id, gameDate, homeWon, `${g.homeScore}-${g.awayScore}`, vol.home),
      ]);

      if (isFinal) {
        mvixFinalized.add(gameKey);
        mvixLiveRecorded.delete(gameKey);
        console.log(`MVIX finalized: ${g.awayAbbr} vs ${g.homeAbbr} (${g.id})`);
      } else {
        mvixLiveRecorded.add(gameKey);
        console.log(`MVIX initial: ${g.awayAbbr} vs ${g.homeAbbr} (${g.id})`);
      }
    } catch (err) {
      console.error(`MVIX record failed for ${g.id}:`, err.message);
    }
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date'); // YYYYMMDD format, optional
    const now = Date.now();

    // Historical date request — use separate cache, no dedup needed
    if (dateStr) {
      const cached = historicalCache.get(dateStr);
      if (cached && now - cached.timestamp < HISTORICAL_CACHE_TTL) {
        return Response.json(cached.data);
      }

      const data = await buildPollData(dateStr);
      historicalCache.set(dateStr, { data, timestamp: now });
      return Response.json(data);
    }

    // Today (live) — original caching + dedup logic
    if (cachedResponse && now - cacheTimestamp < CACHE_TTL) {
      return Response.json(cachedResponse);
    }

    // If a fetch is already in flight, wait for it instead of starting another
    if (!fetchInFlight) {
      fetchInFlight = buildPollData()
        .then((data) => {
          cachedResponse = data;
          cacheTimestamp = Date.now();
          return data;
        })
        .finally(() => {
          fetchInFlight = null;
        });
    }

    const data = await fetchInFlight;
    return Response.json(data);
  } catch (err) {
    console.error('Poll error:', err);
    // Serve stale cache on error if available
    if (cachedResponse) {
      return Response.json(cachedResponse);
    }
    return Response.json({ games: [], timestamp: new Date().toISOString(), error: err.message }, { status: 500 });
  }
}
