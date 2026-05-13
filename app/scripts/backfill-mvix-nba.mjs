#!/usr/bin/env node
/**
 * The Swing — NBA MVIX Backfill
 *
 * Recomputes team_mvix for all NBA games this season using the SR possession
 * model (the same model the live poll route uses), replacing any prior rows
 * that were computed from the old mirror-based momentum charts.
 *
 * Usage:
 *   node --env-file=../apps/casual-fan/.env.local scripts/backfill-mvix-nba.mjs
 *   node --env-file=../apps/casual-fan/.env.local scripts/backfill-mvix-nba.mjs --start 2026-01-01
 *   node --env-file=../apps/casual-fan/.env.local scripts/backfill-mvix-nba.mjs --start 2026-01-01 --end 2026-01-31
 *
 * Requires POSTGRES_URL in environment (loaded from .env.local above, or set directly).
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from .env.local if POSTGRES_URL not already set
if (!process.env.POSTGRES_URL) {
  const envPath = resolve(__dirname, '../../apps/casual-fan/.env.local');
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.error(`Could not read ${envPath} — set POSTGRES_URL manually or use --env-file`);
    process.exit(1);
  }
}

if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL is not set');
  process.exit(1);
}

// CJS modules
const require = createRequire(import.meta.url);
const espn = require('../lib/espn.js');
const { computeMomentumFromPlays } = require('../lib/momentum.js');
const { computePossessionMomentumWithChart } = require('../lib/sr-possession.js');

// ESM modules
const { computeGameVolatility } = await import('../lib/mvix.js');
const { recordGameMvix } = await import('../lib/team-mvix.js');

// ── Config ─────────────────────────────────────────────────────────────────────

const SEASON_START = '2025-10-22';
const SEASON_END   = '2026-06-22';
const DELAY_MS     = 1500; // between ESPN requests

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function toEspnDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start' && args[i + 1]) out.start = args[++i];
    if (args[i] === '--end'   && args[i + 1]) out.end   = args[++i];
    if (args[i] === '--dry-run') out.dryRun = true;
  }
  return out;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const today = new Date().toISOString().slice(0, 10);
  const start = args.start || SEASON_START;
  const end   = args.end   || today;

  if (end > today) {
    console.error(`End date ${end} is in the future`);
    process.exit(1);
  }

  console.log('\nThe Swing — NBA MVIX Backfill (SR Possession Model)');
  console.log(`Range : ${start} → ${end}`);
  if (args.dryRun) console.log('DRY RUN — no writes to DB');
  console.log('');

  // Walk the season day by day, collect all final NBA games
  console.log('Discovering games...');
  const games = [];
  let current = start;
  while (current <= end) {
    const dateStr = toEspnDate(current);
    const events = await espn.fetchNbaScoreboard(dateStr);
    const finals = (events || []).filter((e) => e.status?.type?.name === 'STATUS_FINAL' && e.id);
    if (finals.length) {
      console.log(`  ${current}: ${finals.length} final game(s)`);
      for (const e of finals) games.push({ event: e, gameDate: current });
    }
    current = addDays(current, 1);
    await sleep(DELAY_MS);
  }

  console.log(`\nFound ${games.length} NBA games. Processing...\n`);

  let processed = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const { event, gameDate } of games) {
    const gameId = event.id;
    const g = espn.parseScoreboardEvent(event, 'NBA');

    process.stdout.write(`  [${processed + skipped + errors + 1}/${games.length}] ${g.awayAbbr} @ ${g.homeAbbr} (${gameDate})... `);

    try {
      const summary = await espn.fetchGameSummary(gameId, 'NBA');
      const plays   = espn.getPlaysFromSummary(summary);

      if (!plays || plays.length < 10) {
        console.log('skip (no plays)');
        skipped++;
        await sleep(DELAY_MS);
        continue;
      }

      // ESPN sliding-window chart — same model used for NCAAB and live MVIX display.
      // SR possession model provides the scalar scores (alert accuracy) but its
      // exponential decay produces charts too smooth for meaningful MVIX values.
      const espnMom = computeMomentumFromPlays(
        plays, g.awayAbbr, g.homeAbbr, g.awayId, g.homeId, 'NBA'
      );

      if (!espnMom?.chartAway?.length || !espnMom?.chartHome?.length) {
        console.log('skip (no chart)');
        skipped++;
        await sleep(DELAY_MS);
        continue;
      }

      // computeGameVolatility already attaches mrvi and combo internally
      const vol = computeGameVolatility(espnMom.chartAway, espnMom.chartHome, 'NBA');
      if (!vol?.away || !vol?.home) {
        console.log('skip (no volatility)');
        skipped++;
        await sleep(DELAY_MS);
        continue;
      }

      const awayWon = g.awayScore > g.homeScore;
      const homeWon = g.homeScore > g.awayScore;
      const awayScore = `${g.awayScore}-${g.homeScore}`;
      const homeScore = `${g.homeScore}-${g.awayScore}`;

      if (!args.dryRun) {
        await Promise.all([
          recordGameMvix(g.awayAbbr, 'NBA', gameId, gameDate, awayWon, awayScore, vol.away),
          recordGameMvix(g.homeAbbr, 'NBA', gameId, gameDate, homeWon, homeScore, vol.home),
        ]);
      }

      console.log(
        `ok  away MVIX=${vol.away.mvix} MRVI=${vol.away.mrvi != null ? Math.round(vol.away.mrvi) : '–'}` +
        `  home MVIX=${vol.home.mvix} MRVI=${vol.home.mrvi != null ? Math.round(vol.home.mrvi) : '–'}`
      );
      processed++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. ${processed} written, ${skipped} skipped, ${errors} errors.`);
  if (args.dryRun) console.log('(dry run — nothing written to DB)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
