// app/scripts/build-sim-replay.mjs
// Run: node --env-file=../apps/casual-fan/.env.local scripts/build-sim-replay.mjs

import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const { fetchNbaScoreboard, fetchCbbScoreboard, fetchGameSummary, parseScoreboardEvent, getPlaysFromSummary } = require('../lib/espn.js');
const { computeMomentumFromPlays } = require('../lib/momentum.js');
const { detectAlerts } = require('../lib/alerts.js');

const SIM_DATE = '20260320';
const WINDOW_START = new Date('2026-03-20T21:00:00-04:00');
const WINDOW_END   = new Date('2026-03-20T21:30:00-04:00');
const FRAME_COUNT  = 31; // 9:00 PM through 9:30 PM, one per minute

// Estimated total game duration in ms (used as fallback when wallclock missing)
const GAME_DURATION_MS = { NBA: 9_000_000, CBB: 7_200_000 };

function getScoreAtPlays(plays) {
  for (let i = plays.length - 1; i >= 0; i--) {
    const p = plays[i];
    if (p.homeScore != null && p.awayScore != null) {
      return { homeScore: Number(p.homeScore), awayScore: Number(p.awayScore) };
    }
  }
  return { homeScore: 0, awayScore: 0 };
}

function getClockAtPlays(plays, league) {
  for (let i = plays.length - 1; i >= 0; i--) {
    const p = plays[i];
    if (p.period?.number != null && p.clock?.displayValue) {
      return { period: p.period.number, clock: p.clock.displayValue };
    }
  }
  return { period: 1, clock: league === 'NBA' ? '12:00' : '20:00' };
}

function buildGameAtFrame(g, allPlays, simTime) {
  const gameStart = new Date(g.date).getTime();
  const simMs = simTime.getTime();
  const gameEnd = gameStart + (GAME_DURATION_MS[g.league] ?? GAME_DURATION_MS.CBB);

  // Pre-game
  if (simMs < gameStart) {
    return {
      id: g.id, league: g.league, state: 'scheduled',
      startsAt: g.date,
      away: { team: { abbr: g.awayAbbr, name: g.awayName, fullName: g.awayName, league: g.league }, score: null, momentum: null },
      home: { team: { abbr: g.homeAbbr, name: g.homeName, fullName: g.homeName, league: g.league }, score: null, momentum: null },
      _rawStatus: 'STATUS_SCHEDULED', _alerts: { bluffing: false, comeback: false, swingWarning: false },
    };
  }

  // Determine play subset: prefer wallclock, fall back to linear interpolation
  let subsetPlays;
  const playsWithWallclock = allPlays.filter(p => p.wallclock);
  if (playsWithWallclock.length > 0) {
    const simISO = simTime.toISOString();
    subsetPlays = allPlays.filter(p => !p.wallclock || p.wallclock <= simISO);
  } else {
    const fraction = Math.min((simMs - gameStart) / (gameEnd - gameStart), 1);
    const cutoff = Math.floor(fraction * allPlays.length);
    subsetPlays = allPlays.slice(0, cutoff);
  }

  // If all plays are exhausted (game is over at this simTime) → final
  // Note: we intentionally do NOT short-circuit on g.status === 'STATUS_FINAL'
  // because for replay sim we want to treat each game as live up until its
  // last play's wallclock has been reached.
  const isOver = subsetPlays.length > 0 && subsetPlays.length === allPlays.length && simMs > gameEnd;

  const state = isOver ? 'final' : 'live';
  const rawStatus = isOver ? 'STATUS_FINAL' : 'STATUS_IN_PROGRESS';

  const mom = subsetPlays.length > 0
    ? computeMomentumFromPlays(subsetPlays, g.awayAbbr, g.homeAbbr, g.awayId, g.homeId, g.league)
    : null;

  const { homeScore, awayScore } = subsetPlays.length > 0
    ? getScoreAtPlays(subsetPlays)
    : { homeScore: 0, awayScore: 0 };

  const { period, clock } = subsetPlays.length > 0
    ? getClockAtPlays(subsetPlays, g.league)
    : { period: 1, clock: g.league === 'NBA' ? '12:00' : '20:00' };

  const gameForAlerts = {
    ...g,
    status: rawStatus,
    awayScore,
    homeScore,
    period,
    clock,
    mom,
  };
  const alerts = state === 'live' ? detectAlerts(gameForAlerts) : { bluffing: false, comeback: false, swingWarning: false };

  return {
    id: g.id,
    league: g.league,
    state,
    startsAt: g.date,
    period: String(period),
    clock,
    away: {
      team: { abbr: g.awayAbbr, name: g.awayName, fullName: g.awayName, league: g.league },
      score: awayScore,
      momentum: mom?.away != null ? Math.round(mom.away) : null,
    },
    home: {
      team: { abbr: g.homeAbbr, name: g.homeName, fullName: g.homeName, league: g.league },
      score: homeScore,
      momentum: mom?.home != null ? Math.round(mom.home) : null,
    },
    _rawStatus: rawStatus,
    _alerts: alerts,
  };
}

async function main() {
  console.log('Fetching scoreboard for', SIM_DATE, '...');
  const [nbaEvents, cbbEvents] = await Promise.all([
    fetchNbaScoreboard(SIM_DATE),
    fetchCbbScoreboard(SIM_DATE),
  ]);

  const allEvents = [
    ...nbaEvents.map(e => ({ ...e, league: 'NBA' })),
    ...cbbEvents.map(e => ({ ...e, league: 'CBB' })),
  ];
  const games = allEvents.map(e => parseScoreboardEvent(e, e.league));
  console.log(`Found ${games.length} games (${nbaEvents.length} NBA, ${cbbEvents.length} CBB)`);

  // Fetch PBP for all games (sequential to avoid rate limits)
  console.log('Fetching play-by-play...');
  const gameDataArr = [];
  for (const g of games) {
    process.stdout.write(`  ${g.awayAbbr}@${g.homeAbbr} (${g.league})... `);
    const summary = await fetchGameSummary(g.id, g.league);
    const plays = getPlaysFromSummary(summary);
    console.log(`${plays.length} plays`);
    gameDataArr.push({ g, plays });
    // Polite delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Build frames
  console.log('Building 31 frames...');
  const frames = [];
  // Track previous alert state per game for transition detection
  const prevAlerts = {};
  const alertEvents = [];

  for (let f = 0; f < FRAME_COUNT; f++) {
    const simTime = new Date(WINDOW_START.getTime() + f * 60_000);
    const label = simTime.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const frameGames = [];
    for (const { g, plays } of gameDataArr) {
      const built = buildGameAtFrame(g, plays, simTime);

      // Detect alert transitions for this frame
      const prev = prevAlerts[g.id] ?? { bluffing: false, comeback: false, swingWarning: false };
      const curr = built._alerts;
      for (const alertType of ['bluffing', 'comeback', 'swingWarning']) {
        if (!prev[alertType] && curr[alertType]) {
          const typeKey = alertType === 'swingWarning' ? 'swing-warning' : alertType;
          alertEvents.push({
            id: `${g.id}-${typeKey}-${f}`,
            frameIndex: f,
            simTime: simTime.toISOString(),
            gameId: g.id,
            type: typeKey,
            firedAt: simTime.toISOString(),
            gameClock: built.clock ?? '',
            period: built.period ?? '1',
            awayAbbr: g.awayAbbr,
            homeAbbr: g.homeAbbr,
            awayScore: built.away.score ?? 0,
            homeScore: built.home.score ?? 0,
            momentumPct: alertType === 'bluffing'
              ? (built.away.momentum ?? 50)
              : Math.max(built.away.momentum ?? 50, built.home.momentum ?? 50),
            pointGap: Math.abs((built.away.score ?? 0) - (built.home.score ?? 0)),
          });
        }
      }
      prevAlerts[g.id] = curr;

      // Strip internal fields before storing
      const { _rawStatus, _alerts, ...gameForFrame } = built;
      frameGames.push(gameForFrame);
    }

    frames.push({
      frameIndex: f,
      simTime: simTime.toISOString(),
      label,
      games: frameGames,
    });
    process.stdout.write(`  Frame ${f} (${label}): ${frameGames.filter(g => g.state === 'live').length} live, ${alertEvents.filter(e => e.frameIndex === f).length} new alerts\n`);
  }

  const output = {
    date: SIM_DATE,
    windowStart: WINDOW_START.toISOString(),
    windowEnd: WINDOW_END.toISOString(),
    frames,
    alertEvents,
  };

  const outDir = join(__dirname, '..', 'data', 'sim');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${SIM_DATE}.json`);
  writeFileSync(outPath, JSON.stringify(output));
  console.log(`\nWrote ${outPath} (${(JSON.stringify(output).length / 1024).toFixed(0)} KB)`);
  console.log(`Total alert events: ${alertEvents.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
