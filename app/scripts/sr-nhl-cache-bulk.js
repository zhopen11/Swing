#!/usr/bin/env node

/**
 * The Swing — Sportradar NHL PBP Bulk Cache
 *
 * Fetches play-by-play for every completed NHL game in a date range and saves
 * each game's raw SR JSON to data/sr-nhl-cache/{gameId}.json. Already-cached
 * games are skipped automatically.
 *
 * Also writes data/sr-nhl-cache/manifest.json with team aliases, final score,
 * and date for every cached game.
 *
 * Usage:
 *   SPORTRADAR_NHL_KEY=<key> node scripts/sr-nhl-cache-bulk.js
 *   SPORTRADAR_NHL_KEY=<key> node scripts/sr-nhl-cache-bulk.js --start 2026-02-01 --end 2026-04-18
 *   SPORTRADAR_NHL_KEY=<key> node scripts/sr-nhl-cache-bulk.js --budget 200
 *   SPORTRADAR_NHL_KEY=<key> node scripts/sr-nhl-cache-bulk.js --dry-run
 *
 * Budget guidance:
 *   Each date costs 1 schedule call. Each game costs 1 PBP call.
 *   NHL playoffs (first round → Finals) need ~150 PBP + ~60 schedule = ~210 calls.
 *   Leave at least 250 calls in reserve for live playoff caching.
 */

const { parseArgs } = require('util');
const fs   = require('fs');
const path = require('path');
const nhl  = require('../lib/sportradar-nhl');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLI ───────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    start:     { type: 'string' },
    end:       { type: 'string' },
    budget:    { type: 'string' },   // max PBP fetches this run (default 400)
    'dry-run': { type: 'boolean', default: false },
  },
});

if (!process.env.SPORTRADAR_NHL_KEY) {
  console.error('Error: SPORTRADAR_NHL_KEY not set.');
  process.exit(1);
}

// Default budget: 400 PBP calls — leaves ~600 calls for playoffs on a 1,000-call trial
const BUDGET  = args.budget ? parseInt(args.budget) : 400;
const DRY_RUN = args['dry-run'];

// Default window: back half of 2025-26 regular season
// Skips preseason noise, captures the stretch run where games matter most
const DEFAULT_START = '2026-01-15';
const DEFAULT_END   = '2026-04-18';

function dateRange(start, end) {
  const dates = [];
  const cur   = new Date(start + 'T12:00:00Z');
  const stop  = new Date(end   + 'T12:00:00Z');
  while (cur <= stop) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const DATES = dateRange(args.start || DEFAULT_START, args.end || DEFAULT_END);

// ── Cache dirs ────────────────────────────────────────────────────────────────

const CACHE_DIR = path.join(__dirname, '../../data/sr-nhl-cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const MANIFEST_FILE = path.join(CACHE_DIR, 'manifest.json');

function loadManifest() {
  if (fs.existsSync(MANIFEST_FILE)) {
    try { return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')); } catch { /* corrupt */ }
  }
  return { cachedAt: null, games: [] };
}

function saveManifest(manifest) {
  manifest.cachedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
}

function isCached(gameId) {
  return fs.existsSync(path.join(CACHE_DIR, `${gameId}.json`));
}

function writePbp(gameId, data) {
  fs.writeFileSync(path.join(CACHE_DIR, `${gameId}.json`), JSON.stringify(data));
}

function teamAlias(team) {
  return (team?.alias || team?.abbr || team?.name || '???').toUpperCase().slice(0, 4);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const manifest    = loadManifest();
  const existingIds = new Set(manifest.games.map((g) => g.gameId));

  let scheduleCalls = 0;
  let pbpCalls      = 0;
  let cached        = 0;
  let skipped       = 0;
  let failed        = 0;
  const newGames    = [];

  console.log('\nThe Swing — Sportradar NHL PBP Bulk Cache');
  console.log(`Cache dir     : ${CACHE_DIR}`);
  console.log(`Date range    : ${DATES[0]} → ${DATES[DATES.length - 1]}  (${DATES.length} dates)`);
  console.log(`Dry run       : ${DRY_RUN}`);
  console.log(`PBP budget    : ${BUDGET} calls`);
  console.log(`Already cached: ${existingIds.size} games\n`);

  let budgetHit = false;

  for (const date of DATES) {
    if (budgetHit) break;

    let schedule;
    try {
      if (DRY_RUN) {
        console.log(`[dry-run] Would fetch schedule for ${date}`);
        continue;
      }
      schedule = await nhl.fetchDailySchedule(date);
      await sleep(nhl.SR_DELAY);
      scheduleCalls++;
    } catch (e) {
      console.error(`[SR] Schedule fetch failed for ${date}: ${e.message}`);
      continue;
    }

    const allGames  = schedule.games || schedule.day?.games || [];
    const completed = allGames.filter((g) => ['closed', 'complete'].includes(g.status));

    if (completed.length === 0) {
      process.stdout.write('.');
      continue;
    }

    console.log(`\n── ${date} — ${completed.length} completed games ──`);

    for (const game of completed) {
      const gameId = game.id;
      const away   = teamAlias(game.away);
      const home   = teamAlias(game.home);
      const label  = `${away} @ ${home}`;

      if (existingIds.has(gameId) || isCached(gameId)) {
        console.log(`  [skip]   ${label} — already cached`);
        skipped++;
        continue;
      }

      if (pbpCalls >= BUDGET) {
        console.log(`  [budget] PBP budget of ${BUDGET} reached — stopping`);
        budgetHit = true;
        break;
      }

      console.log(`  [fetch]  ${label}  id=${gameId}`);

      try {
        const pbp = await nhl.fetchPbp(gameId);
        await sleep(nhl.SR_DELAY);
        pbpCalls++;

        const periodCount = (pbp.periods || []).length;
        const totalEvents = (pbp.periods || []).reduce(
          (sum, p) => sum + (p.events || []).length, 0,
        );

        if (totalEvents === 0) {
          console.log(`    [warn] No events — skipping write`);
          failed++;
          continue;
        }

        writePbp(gameId, pbp);

        newGames.push({ gameId, date, away, home, periods: periodCount, totalEvents, cachedAt: new Date().toISOString() });
        existingIds.add(gameId);
        cached++;
        console.log(`    [ok]   ${totalEvents} events, ${periodCount} periods`);

      } catch (e) {
        console.error(`    [err]  ${e.message}`);
        failed++;
        await sleep(nhl.SR_DELAY);
      }
    }
  }

  if (newGames.length > 0) {
    manifest.games.push(...newGames);
    saveManifest(manifest);
  }

  const totalCalls = scheduleCalls + pbpCalls;

  console.log('\n\n══════════════════════════════════════════════════════════');
  console.log('  NHL CACHE SUMMARY');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Games newly cached  : ${cached}`);
  console.log(`  Games skipped       : ${skipped}`);
  console.log(`  Fetch errors        : ${failed}`);
  console.log(`  Total games in cache: ${existingIds.size}`);
  console.log(`  API calls used      : ${totalCalls}  (${scheduleCalls} schedule + ${pbpCalls} PBP)`);
  console.log(`  Estimated remaining : ~${1000 - totalCalls} calls on a 1,000-call trial`);
  console.log(`  Manifest            : ${MANIFEST_FILE}`);
  console.log('══════════════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
