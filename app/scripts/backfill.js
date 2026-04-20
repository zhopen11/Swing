#!/usr/bin/env node

/**
 * The Swing — Historical backfill script.
 *
 * Usage:
 *   node scripts/backfill.js [--league NBA|CBB] [--start YYYY-MM-DD] [--end YYYY-MM-DD]
 */

const { parseArgs } = require('util');
const espn = require('../lib/espn');
const momentum = require('../lib/momentum');
const alerts = require('../lib/alerts');
const db = require('../lib/db');
const { BACKFILL_DELAY } = require('../lib/config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Season date ranges (2025-26)
const SEASONS = {
  NBA: { start: '2025-10-22', end: '2026-06-22' }, // extended through 2026 playoffs
  CBB: { start: '2025-11-03', end: '2026-04-08' },
};

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function toEspnDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / 86400000) + 1;
}

async function discoverGames(league, startDate, endDate) {
  const season = SEASONS[league];
  const start = startDate || season.start;
  const today = new Date().toISOString().slice(0, 10);
  const end = endDate && endDate < today ? endDate : today;
  const totalDays = daysBetween(start, end);
  const games = [];

  let current = start;
  let dayCount = 0;

  while (current <= end) {
    dayCount++;
    const dateStr = toEspnDate(current);
    console.log(`[${dayCount}/${totalDays}] Discovering ${league} games for ${current}`);

    const events =
      league === 'NBA'
        ? await espn.fetchNbaScoreboard(dateStr)
        : await espn.fetchCbbScoreboard(dateStr);

    let finalCount = 0;
    for (const event of events) {
      const status = event.status?.type?.name || '';
      if (status === 'STATUS_FINAL' && event.id) {
        finalCount++;
        games.push({ gameId: event.id, event, gameDate: current });
      }
    }
    console.log(`  Found ${finalCount} completed games`);

    current = addDays(current, 1);
    await sleep(BACKFILL_DELAY);
  }

  return games;
}

function simulateAlerts(database, game, mom) {
  let bluffingCount = 0;
  let comebackCount = 0;
  let swingWarnCount = 0;
  const bluffOutcomes = [];
  const comebackOutcomes = [];

  const finalAwayScore = game.awayScore;
  const finalHomeScore = game.homeScore;

  const chartAway = mom.chartAway;
  const chartHome = mom.chartHome;

  for (let i = 0; i < Math.min(chartAway.length, chartHome.length); i++) {
    const ca = chartAway[i];
    const ch = chartHome[i];

    const snapGame = {
      status: 'STATUS_IN_PROGRESS',
      awayScore: ca.as || 0,
      homeScore: ca.hs || 0,
      mom: { away: ca.v, home: ch.v },
    };

    const result = alerts.detectAlerts(snapGame);

    if (result.bluffing) {
      bluffingCount++;
      db.storeAlert(
        database, game.id, 'BLUFFING',
        ca.v, ch.v, snapGame.awayScore, snapGame.homeScore,
        ca.p, ca.c,
      );
      const scoreLeader = snapGame.awayScore > snapGame.homeScore ? 'away' : 'home';
      const finalLeader = finalAwayScore > finalHomeScore ? 'away' : 'home';
      bluffOutcomes.push(scoreLeader !== finalLeader ? 1 : 0);
    } else if (result.comeback) {
      comebackCount++;
      db.storeAlert(
        database, game.id, 'COMEBACK',
        ca.v, ch.v, snapGame.awayScore, snapGame.homeScore,
        ca.p, ca.c,
      );
      const trailingTeam = snapGame.awayScore < snapGame.homeScore ? 'away' : 'home';
      const gapAtAlert = Math.abs(snapGame.awayScore - snapGame.homeScore);
      const finalGap = finalAwayScore - finalHomeScore;
      const finalGapForTrailing = trailingTeam === 'away' ? finalGap : -finalGap;
      comebackOutcomes.push(finalGapForTrailing > -(gapAtAlert / 2) ? 1 : 0);
    } else if (result.swingWarning) {
      swingWarnCount++;
      db.storeAlert(
        database, game.id, 'SWING_WARNING',
        ca.v, ch.v, snapGame.awayScore, snapGame.homeScore,
        ca.p, ca.c,
      );
    }
  }

  const totalAlerts = bluffingCount + comebackCount + swingWarnCount;

  const logEntry = {
    gameId: game.id,
    totalAlerts: totalAlerts,
    bluffingCount,
    comebackCount,
    swingWarnCount,
    bluffCorrect: bluffOutcomes.reduce((a, b) => a + b, 0),
    bluffTotal: bluffOutcomes.length,
    comebackCorrect: comebackOutcomes.reduce((a, b) => a + b, 0),
    comebackTotal: comebackOutcomes.length,
    finalAwayScore,
    finalHomeScore,
  };

  if (totalAlerts > 0) {
    db.storeBackfillLog(database, logEntry);
  }

  return logEntry;
}

async function processGame(database, gameId, event, league, gameDate) {
  if (db.hasGameMomentum(database, gameId)) {
    console.log(`  Skipping ${gameId} (already processed)`);
    return null;
  }

  const game = espn.parseScoreboardEvent(event, league);
  game.gameDate = gameDate;

  const summary = await espn.fetchGameSummary(gameId, league);
  const plays = espn.getPlaysFromSummary(summary);

  if (!plays.length) {
    console.warn(`  No plays found for ${gameId}`);
    db.upsertGame(database, game);
    return null;
  }

  const mom = momentum.computeMomentumFromPlays(
    plays, game.awayAbbr, game.homeAbbr, game.awayId, game.homeId,
  );

  if (!mom) {
    console.warn(`  Momentum returned null for ${gameId}`);
    db.upsertGame(database, game);
    return null;
  }

  game.mom = mom;
  db.upsertGame(database, game);
  db.storePlays(database, gameId, mom.scoredPlays);

  const snapRows = mom.chartAway.map((ca, idx) => [
    gameId, idx, ca.v, mom.chartHome[idx]?.v || 50,
    ca.p, ca.c, ca.t, ca.hs, ca.as, db.nowIso(),
  ]);
  db.storeMomentumSnapshots(database, gameId, snapRows);
  db.storeGameMomentum(database, gameId, mom.away, mom.home, mom.totalPlays, mom.totalTeamed);

  const alertLog = simulateAlerts(database, game, mom);
  return alertLog;
}

async function main() {
  const { values } = parseArgs({
    options: {
      league: { type: 'string', default: 'NBA' },
      start: { type: 'string' },
      end: { type: 'string' },
    },
  });

  const league = values.league.toUpperCase();
  if (!SEASONS[league]) {
    console.error('League must be NBA or CBB');
    process.exit(1);
  }

  console.log(`\nThe Swing — Backfill (${league})`);
  console.log(`Start: ${values.start || SEASONS[league].start}`);
  console.log(`End:   ${values.end || 'today'}\n`);

  const database = db.initDb();

  const games = await discoverGames(league, values.start, values.end);

  let processed = 0;
  let skipped = 0;
  let totalAlerts = 0;

  for (const { gameId, event, gameDate } of games) {
    try {
      const result = await processGame(database, gameId, event, league, gameDate);
      if (result === null) {
        skipped++;
      } else {
        processed++;
        totalAlerts += result.totalAlerts;
        console.log(
          `  [${processed}] ${league} ${gameId}: ` +
            `${result.bluffTotal + result.comebackTotal} plays, ` +
            `${result.totalAlerts} alerts ` +
            `(${result.bluffingCount} bluff, ${result.comebackCount} comeback, ${result.swingWarnCount} swing)`,
        );
      }
    } catch (e) {
      console.error(`  Failed to process game ${gameId}: ${e.message}`);
    }

    await sleep(BACKFILL_DELAY);
  }

  console.log(
    `\nBackfill complete: ${processed} processed, ${skipped} skipped, ${totalAlerts} total alerts`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
