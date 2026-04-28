#!/usr/bin/env node

/**
 * The Swing — Postgres restore script.
 *
 * Restores a custom-format (-Fc) dump produced by backup-db.js into the
 * database referenced by POSTGRES_URL (or a different database via
 * --target-db, useful for verifying a backup without touching the live DB).
 *
 * Usage:
 *   node --env-file=.env.local scripts/restore-db.js <dump-file> [--clean] [--create] [--target-db <name>]
 *
 * Flags:
 *   --clean              drop existing objects before restoring
 *   --create             create the target database if it does not exist
 *   --target-db <name>   restore into <name> instead of the db in POSTGRES_URL
 *
 * Env:
 *   POSTGRES_URL        required
 *   PG_RESTORE          optional override path to a specific pg_restore binary
 */

const { parseArgs } = require('util');
const { spawnSync } = require('child_process');
const fs = require('fs');
const { Client } = require('pg');

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      clean: { type: 'boolean', default: false },
      create: { type: 'boolean', default: false },
      'target-db': { type: 'string' },
    },
  });

  const dumpFile = positionals[0];
  if (!dumpFile) {
    console.error('Usage: restore-db.js <dump-file> [--clean] [--create] [--target-db <name>]');
    process.exit(1);
  }
  if (!fs.existsSync(dumpFile)) {
    console.error(`Dump file not found: ${dumpFile}`);
    process.exit(1);
  }

  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error('POSTGRES_URL is not set. Did you run with --env-file=.env.local ?');
    process.exit(1);
  }

  const targetUrl = retargetUrl(url, values['target-db']);
  const { dbName: targetDb } = parseUrl(targetUrl);
  const serverMajor = await detectServerMajorVersion(url);
  const pgRestore = resolvePgRestore(serverMajor);

  if (values.create) {
    await ensureDatabase(url, targetDb);
  }

  console.log(`pg_restore: ${pgRestore}`);
  console.log(`target db:  ${targetDb}`);
  console.log(`dump file:  ${dumpFile} (${(fs.statSync(dumpFile).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`flags:      ${values.clean ? '--clean ' : ''}${values.create ? '--create-db ' : ''}`.trim() || '(none)');

  const args = [
    '-d', targetUrl,
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
  ];
  if (values.clean) args.push('--clean', '--if-exists');
  args.push(dumpFile);

  const result = spawnSync(pgRestore, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`pg_restore exited with status ${result.status}`);
    process.exit(result.status || 1);
  }

  console.log('done');
}

function parseUrl(url) {
  const u = new URL(url);
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!dbName) throw new Error('POSTGRES_URL has no database name in its path');
  return { dbName };
}

function retargetUrl(url, targetDb) {
  if (!targetDb) return url;
  const u = new URL(url);
  u.pathname = '/' + encodeURIComponent(targetDb);
  return u.toString();
}

async function detectServerMajorVersion(url) {
  // Connect to the server (via the original URL) to read its version.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rows } = await client.query('SHOW server_version_num');
    const num = parseInt(rows[0].server_version_num, 10);
    return Math.floor(num / 10000);
  } finally {
    await client.end();
  }
}

async function ensureDatabase(url, targetDb) {
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDb]
    );
    if (rows.length === 0) {
      // Identifiers cannot be parameterized — quote defensively.
      const quoted = '"' + targetDb.replace(/"/g, '""') + '"';
      await client.query(`CREATE DATABASE ${quoted}`);
      console.log(`created database ${targetDb}`);
    }
  } finally {
    await client.end();
  }
}

function resolvePgRestore(serverMajor) {
  if (process.env.PG_RESTORE) return process.env.PG_RESTORE;
  const versioned = `/usr/lib/postgresql/${serverMajor}/bin/pg_restore`;
  if (fs.existsSync(versioned)) return versioned;
  return 'pg_restore';
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
