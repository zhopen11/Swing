#!/usr/bin/env node

/**
 * The Swing — Postgres backup script.
 *
 * Reads POSTGRES_URL from the environment, detects the server version, picks
 * a matching pg_dump binary, and writes a custom-format (-Fc) dump to
 * <repo>/backups/<dbname>-<timestamp>.dump.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backup-db.js [--out <path>]
 *
 * Env:
 *   POSTGRES_URL        required
 *   PG_DUMP             optional override path to a specific pg_dump binary
 */

const { parseArgs } = require('util');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BACKUP_DIR = path.join(REPO_ROOT, 'backups');

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
    },
  });

  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error('POSTGRES_URL is not set. Did you run with --env-file=.env.local ?');
    process.exit(1);
  }

  const { dbName } = parseUrl(url);
  const serverMajor = await detectServerMajorVersion(url);
  const pgDump = resolvePgDump(serverMajor);

  const dumpVersion = pgDumpVersion(pgDump);
  if (dumpVersion && serverMajor && Number(dumpVersion.split('.')[0]) < serverMajor) {
    console.error(
      `Refusing to dump: pg_dump ${dumpVersion} is older than server ${serverMajor}.\n` +
      `  Set PG_DUMP=/usr/lib/postgresql/${serverMajor}/bin/pg_dump to override.`
    );
    process.exit(1);
  }

  const outPath =
    values.out ||
    path.join(DEFAULT_BACKUP_DIR, `${dbName}-${timestamp()}.dump`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  console.log(`pg_dump:    ${pgDump} (v${dumpVersion || 'unknown'})`);
  console.log(`server:     PostgreSQL ${serverMajor}`);
  console.log(`database:   ${dbName}`);
  console.log(`output:     ${outPath}`);

  const result = spawnSync(
    pgDump,
    ['-Fc', '--no-owner', '--no-privileges', '-d', url, '-f', outPath],
    { stdio: 'inherit' }
  );

  if (result.status !== 0) {
    console.error(`pg_dump exited with status ${result.status}`);
    process.exit(result.status || 1);
  }

  const size = fs.statSync(outPath).size;
  console.log(`done — ${(size / 1024 / 1024).toFixed(2)} MB`);
}

function parseUrl(url) {
  const u = new URL(url);
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!dbName) throw new Error('POSTGRES_URL has no database name in its path');
  return { dbName, host: u.hostname, port: u.port || '5432' };
}

async function detectServerMajorVersion(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query('SHOW server_version_num');
    const num = parseInt(rows[0].server_version_num, 10);
    return Math.floor(num / 10000);
  } finally {
    await client.end();
  }
}

function resolvePgDump(serverMajor) {
  if (process.env.PG_DUMP) return process.env.PG_DUMP;
  const versioned = `/usr/lib/postgresql/${serverMajor}/bin/pg_dump`;
  if (fs.existsSync(versioned)) return versioned;
  return 'pg_dump';
}

function pgDumpVersion(bin) {
  const out = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  if (out.status !== 0) return null;
  const m = out.stdout.match(/pg_dump.*?(\d+\.\d+)/);
  return m ? m[1] : null;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
