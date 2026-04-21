/** /api/hockey/poll — SR NHL scoreboard + PBP, HDSR momentum, alerts */

import { computeGameVolatility } from '../../../../lib/mvix';
import { recordGameMvix } from '../../../../lib/team-mvix';

const nhl = require('../../../../lib/sportradar-nhl');
const { hdsrMomentumWithChart, detectAlerts } = require('../../../../lib/sr-nhl-possession');

export const dynamic = 'force-dynamic';

const CACHE_TTL  = 15_000; // 15s — slightly more lenient than basketball (SR rate limits)
let   cachedData = null;
let   cacheTs    = 0;
let   inFlight   = null;
const finalCache = new Map(); // gameId → mom (immutable once final)

const mvixLiveRecorded = new Set();
const mvixFinalized    = new Set();

// ── NHL team primary colours (home jersey) ───────────────────────────────────
const NHL_COLORS = {
  ANA: '#F47A38', ARI: '#8C2633', BOS: '#FFB81C', BUF: '#003087',
  CGY: '#D2001C', CAR: '#CC0000', CHI: '#CF0A2C', COL: '#6F263D',
  CBJ: '#002654', DAL: '#006847', DET: '#CE1126', EDM: '#CF4520',
  FLA: '#041E42', LA:  '#111111', MIN: '#154734', MTL: '#AF1E2D',
  NSH: '#FFB81C', NJ:  '#CE1126', NYI: '#003087', NYR: '#0038A8',
  OTT: '#DA1A32', PHI: '#F74902', PIT: '#000000', SEA: '#001628',
  SJ:  '#006D75', STL: '#002F87', TB:  '#002868', TOR: '#003E7E',
  UTA: '#69B3E7', VAN: '#00205B', VGK: '#B4975A', WSH: '#C8102E',
  WPG: '#041E42',
};
const DEFAULT_COLOR = '#1493ff';

function teamColor(alias) {
  return NHL_COLORS[(alias || '').toUpperCase()] || DEFAULT_COLOR;
}

// ── SR status → app status ────────────────────────────────────────────────────
function mapStatus(srStatus) {
  const s = (srStatus || '').toLowerCase();
  if (s === 'inprogress')                return 'STATUS_IN_PROGRESS';
  if (s === 'intermission')              return 'STATUS_HALFTIME';
  if (s === 'closed' || s === 'complete') return 'STATUS_FINAL';
  return 'STATUS_SCHEDULED';
}

// ── Flatten SR PBP periods into a single event array ─────────────────────────
function flattenPbp(pbp) {
  return (pbp.periods || []).flatMap(p =>
    (p.events || []).map(e => ({ ...e, period: e.period ?? p.number ?? p.sequence }))
  );
}

// ── Parse SR schedule game into standardised shape ───────────────────────────
function parseGame(g, date) {
  const away    = (g.away?.alias || g.away?.abbr || '???').toUpperCase();
  const home    = (g.home?.alias || g.home?.abbr || '???').toUpperCase();
  const status  = mapStatus(g.status);

  // SR puts current period + clock at the top-level game object for live games
  const period  = g.period_of_play ?? g.period ?? 0;
  const clock   = g.clock ?? '';

  return {
    id:         g.id,
    league:     'NHL',
    status,
    period,
    clock,
    date,
    awayAbbr:   away,
    homeAbbr:   home,
    awayName:   g.away?.name   || away,
    homeName:   g.home?.name   || home,
    awayColor:  teamColor(away),
    homeColor:  teamColor(home),
    awayId:     g.away?.id     || null,
    homeId:     g.home?.id     || null,
    awayScore:  g.away_points  ?? g.away?.points ?? 0,
    homeScore:  g.home_points  ?? g.home?.points ?? 0,
    venue:      g.venue?.name  || null,
    broadcast:  g.broadcast?.network || null,
  };
}

// ── Main data build ───────────────────────────────────────────────────────────
async function buildHockeyData(dateStr) {
  const today = dateStr || new Date().toISOString().slice(0, 10);
  let schedule;
  try {
    schedule = await nhl.fetchDailySchedule(today);
  } catch (e) {
    console.error('NHL schedule fetch failed:', e.message);
    return { games: [], timestamp: new Date().toISOString() };
  }

  const raw   = schedule.games || schedule.day?.games || [];
  const games = raw.map(g => parseGame(g, today));

  const LIVE_STATUSES = new Set(['STATUS_IN_PROGRESS', 'STATUS_HALFTIME']);
  const needDetail    = games.filter(g =>
    LIVE_STATUSES.has(g.status) || g.status === 'STATUS_FINAL'
  );

  // Fetch PBP sequentially to respect SR trial rate limit (1 req/sec)
  for (const game of needDetail) {
    if (finalCache.has(game.id)) {
      game.mom = finalCache.get(game.id);
    } else {
      try {
        await new Promise(r => setTimeout(r, nhl.SR_DELAY));
        const pbp    = await nhl.fetchPbp(game.id);
        const events = flattenPbp(pbp);

        // Update period/clock from PBP if richer than schedule
        if (pbp.period)  game.period = pbp.period;
        if (pbp.clock)   game.clock  = pbp.clock;

        if (events.length > 0 && game.homeId && game.awayId) {
          const mom = hdsrMomentumWithChart(events, game.homeId, game.awayId);
          game.mom  = {
            away:      mom.away,
            home:      mom.home,
            chartAway: mom.chartAway,
            chartHome: mom.chartHome,
          };
          if (game.status === 'STATUS_FINAL') {
            finalCache.set(game.id, game.mom);
          }
        }
      } catch (e) {
        console.error(`NHL PBP failed for ${game.id}:`, e.message);
      }
    }

    // Compute MVIX / MRVI
    if (game.mom?.chartAway && game.mom?.chartHome) {
      const vol = computeGameVolatility(game.mom.chartAway, game.mom.chartHome, 'NHL');
      if (vol) {
        game.mvixAway = vol.away;
        game.mvixHome = vol.home;
      }
    }

    // Detect alerts
    if (game.mom) {
      const alerts = detectAlerts(
        game.mom.home, game.mom.away,
        game.homeScore, game.awayScore,
        'even', 'even'
      );
      game.bluffing     = alerts.some(a => a.type === 'SIB');
      game.comeback     = alerts.some(a => a.type === 'CW');
      game.swingWarning = alerts.some(a => a.type === 'SW');
    }
  }

  // Sort: live first, then scheduled, then final
  const order = { STATUS_IN_PROGRESS: 0, STATUS_HALFTIME: 0, STATUS_SCHEDULED: 1, STATUS_FINAL: 2 };
  games.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

  // Fire-and-forget DB recording (skipped for historical date queries)
  if (!dateStr) recordNhlMvix(games);

  return { games, timestamp: new Date().toISOString() };
}

// ── DB recording — runs fire-and-forget after each live poll ─────────────────
async function recordNhlMvix(games) {
  for (const g of games) {
    if (!g.mom?.chartAway || !g.mom?.chartHome) continue;
    const isLive  = g.status === 'STATUS_IN_PROGRESS' || g.status === 'STATUS_HALFTIME';
    const isFinal = g.status === 'STATUS_FINAL';
    if (!isLive && !isFinal) continue;
    if (mvixFinalized.has(g.id)) continue;
    if (isLive && mvixLiveRecorded.has(g.id)) continue;

    try {
      const vol = computeGameVolatility(g.mom.chartAway, g.mom.chartHome, 'NHL');
      if (!vol?.away || !vol?.home) continue;

      const gameDate = g.date || new Date().toISOString().slice(0, 10);
      const awayWon  = isFinal ? g.awayScore > g.homeScore : null;
      const homeWon  = isFinal ? g.homeScore > g.awayScore : null;

      await Promise.all([
        recordGameMvix(g.awayAbbr, 'NHL', g.id, gameDate, awayWon, `${g.awayScore}-${g.homeScore}`, vol.away),
        recordGameMvix(g.homeAbbr, 'NHL', g.id, gameDate, homeWon, `${g.homeScore}-${g.awayScore}`, vol.home),
      ]);

      if (isFinal) {
        mvixFinalized.add(g.id);
        mvixLiveRecorded.delete(g.id);
      } else {
        mvixLiveRecorded.add(g.id);
      }
    } catch (err) {
      console.error(`NHL MVIX record failed for ${g.id}:`, err.message);
    }
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');
    const now     = Date.now();

    if (!dateStr) {
      if (cachedData && now - cacheTs < CACHE_TTL) return Response.json(cachedData);
      if (!inFlight) {
        inFlight = buildHockeyData()
          .then(data => { cachedData = data; cacheTs = Date.now(); return data; })
          .finally(() => { inFlight = null; });
      }
      return Response.json(await inFlight);
    }

    return Response.json(await buildHockeyData(dateStr));
  } catch (err) {
    console.error('Hockey poll error:', err);
    if (cachedData) return Response.json(cachedData);
    return Response.json({ games: [], timestamp: new Date().toISOString(), error: err.message }, { status: 500 });
  }
}
