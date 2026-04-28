# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Swing repo into an npm workspaces monorepo (`shared/`, `apps/casual-fan/`) and replace the inline `CREATE TABLE IF NOT EXISTS` schema bootstrap with a versioned, schema-aware migration framework.

**Architecture:** The repo becomes a workspace with a `@swing/shared` package containing a thin custom migration runner (parses SQL files in a directory, tracks state in a `_migrations` table per Postgres schema, serializes via `pg_advisory_lock`). The existing Next.js app moves to `apps/casual-fan/` and consumes `@swing/shared`. The current schema is captured as migration `0001-baseline.sql` using `IF NOT EXISTS` guards so it is a no-op on dev DBs with restored prod data.

**Tech Stack:** Node 24 LTS, npm workspaces, Next.js 16, Postgres 16, `pg` driver, `node:test` (built-in test runner — no extra deps).

---

## Decisions Locked (resolved here from spec § 5)

| Open decision | Resolution |
|---|---|
| Migration tool | Custom thin layer in `@swing/shared/src/migrations/` |
| Migration file format | Timestamped SQL files: `<YYYYMMDDHHMMSS>-<slug>.sql` |
| Migration direction | Forward-only (no `down`) — roll forward by writing new migrations |
| Concurrency | `pg_advisory_lock(<deterministic-int>)` for the duration of a run |
| Idempotency | `_migrations(name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)` per schema |
| Schema target | Each migrations directory targets one Postgres schema (passed to runner) |
| Test framework | `node:test` (Node built-in, no devDep) |
| Test isolation | Each test creates a uniquely-named ephemeral schema and drops it after |

## File Structure

### Before
```
Swing/
├── app/                      # Next.js app
│   ├── app/                  # App Router routes
│   ├── lib/
│   │   ├── db.js             # initDb() with CREATE TABLE IF NOT EXISTS
│   │   ├── auth.js
│   │   └── ...
│   ├── scripts/
│   ├── package.json          # the only package.json
│   ├── .env.local
│   └── ...
├── docs/
├── README.md
└── (no workspace config)
```

### After
```
Swing/
├── package.json              # workspace root, name=@swing/root
├── apps/
│   └── casual-fan/           # @swing/casual-fan (the moved Next.js app)
│       ├── app/
│       ├── lib/
│       │   ├── db.js         # NO LONGER calls initDb()
│       │   └── ...
│       ├── migrations/       # NEW: timestamped .sql files
│       │   └── 0001-baseline.sql
│       ├── scripts/
│       │   └── migrate.js    # NEW: thin CLI wrapper around @swing/shared
│       ├── package.json
│       ├── .env.local
│       └── ...
├── shared/                   # @swing/shared
│   ├── src/
│   │   ├── index.js          # public API surface
│   │   └── migrations/
│   │       ├── runner.js     # core migration runner
│   │       ├── cli.js        # generic CLI (consumed by per-package wrappers)
│   │       └── index.js      # module public API
│   ├── tests/
│   │   └── migrations/
│   │       ├── runner.test.js
│   │       └── helpers.js    # ephemeral-schema test helpers
│   └── package.json
├── docs/
├── README.md
└── .gitignore
```

---

## Phase 1: Monorepo Restructure

Goal: Convert the single-package layout into npm workspaces with `apps/casual-fan/` and `shared/`. Dev server and existing tests must still work after this phase.

### Task 1: Add workspace root `package.json`

**Files:**
- Create: `/home/chopen/Swing/package.json`

- [ ] **Step 1: Create the workspace root `package.json`**

```json
{
  "name": "@swing/root",
  "version": "0.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "shared",
    "cores/*"
  ],
  "engines": {
    "node": ">=20.18"
  },
  "scripts": {
    "dev": "npm run dev --workspace=@swing/casual-fan",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  }
}
```

- [ ] **Step 2: Commit the workspace root**

```bash
cd /home/chopen/Swing
git add package.json
git commit -m "chore: add npm workspace root"
```

### Task 2: Move `app/` to `apps/casual-fan/` (file moves only, no path edits yet)

**Files:**
- Move: `app/*` → `apps/casual-fan/*` (all files)

- [ ] **Step 1: Create the destination directory and move with git**

```bash
cd /home/chopen/Swing
mkdir -p apps
git mv app apps/casual-fan
```

- [ ] **Step 2: Verify the move preserved all files**

```bash
ls apps/casual-fan/
# Expected: app/ data/ eslint.config.mjs jsconfig.json lib/ next.config.mjs
#           package.json postcss.config.mjs public/ README.md scripts/
#           swingers-of-the-week-march-2026.html swingers-of-the-week-march-2026.pdf
#           tests/ vercel.json (and possibly node_modules, .env.local)
```

- [ ] **Step 3: Commit the move**

```bash
git add -A
git commit -m "chore: move app/ to apps/casual-fan/ for monorepo layout"
```

### Task 3: Update `apps/casual-fan/package.json` for workspaces

**Files:**
- Modify: `apps/casual-fan/package.json`

- [ ] **Step 1: Read the current package.json**

```bash
cat /home/chopen/Swing/apps/casual-fan/package.json
```

- [ ] **Step 2: Update the package name and add a dep on `@swing/shared`**

Replace the contents with:

```json
{
  "name": "@swing/casual-fan",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 4000",
    "build": "next build",
    "vercel-build": "next build",
    "start": "next start",
    "lint": "eslint",
    "format": "prettier --write .",
    "backfill": "node scripts/backfill.js",
    "analysis": "node scripts/analysis.js",
    "sr-compare": "node scripts/sportradar-compare.js",
    "live-compare": "node scripts/live-compare.js",
    "db:backup": "node --env-file=.env.local scripts/backup-db.js",
    "db:restore": "node --env-file=.env.local scripts/restore-db.js",
    "migrate:up": "node --env-file=.env.local scripts/migrate.js up",
    "migrate:status": "node --env-file=.env.local scripts/migrate.js status"
  },
  "dependencies": {
    "@swing/shared": "*",
    "@vercel/postgres": "^0.10.0",
    "jsonwebtoken": "^9.0.3",
    "next": "16.1.6",
    "pg": "^8.20.0",
    "prettier": "^3.8.1",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "eslint": "^9",
    "eslint-config-next": "16.1.6",
    "tailwindcss": "^4"
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/chopen/Swing
git add apps/casual-fan/package.json
git commit -m "chore: rename casual-fan package, add migrate scripts placeholder"
```

### Task 4: Create the `shared/` package skeleton

**Files:**
- Create: `shared/package.json`
- Create: `shared/src/index.js`
- Create: `shared/src/migrations/index.js`
- Create: `shared/.gitignore`

- [ ] **Step 1: Create `shared/package.json`**

```json
{
  "name": "@swing/shared",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./migrations": "./src/migrations/index.js"
  },
  "scripts": {
    "test": "node --test --test-reporter=spec tests/"
  },
  "dependencies": {
    "pg": "^8.20.0"
  }
}
```

- [ ] **Step 2: Create `shared/src/index.js`**

```javascript
// @swing/shared — root re-exports.
module.exports = {
  migrations: require('./migrations'),
};
```

- [ ] **Step 3: Create `shared/src/migrations/index.js` (placeholder)**

```javascript
// Public API for the migrations module. Filled in by Phase 2 tasks.
module.exports = {
  // runMigrations: defined in Task 7
  // migrationStatus: defined in Task 17
};
```

- [ ] **Step 4: Create `shared/.gitignore`**

```
node_modules/
coverage/
```

- [ ] **Step 5: Commit**

```bash
cd /home/chopen/Swing
git add shared/
git commit -m "chore: scaffold @swing/shared package"
```

### Task 5: Install workspace dependencies and verify dev server still works

**Files:** none modified

- [ ] **Step 1: Install all workspaces from the root**

```bash
cd /home/chopen/Swing
# Activate Node 24 LTS via nvm if not already
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use --lts >/dev/null
npm install
```

Expected output: a single `node_modules/` at root, with `@swing/shared` symlinked from `apps/casual-fan/node_modules/@swing/shared` to `../../shared`.

- [ ] **Step 2: Verify the symlink**

```bash
ls -la /home/chopen/Swing/apps/casual-fan/node_modules/@swing/
# Expected: drwxr-xr-x  ... shared -> ../../../../shared
```

- [ ] **Step 3: Start dev server from the workspace root**

```bash
cd /home/chopen/Swing
npm run dev
```

Expected: `✓ Ready in <Nms>` on `http://localhost:4000`. Smoke-test the homepage with `curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://localhost:4000/` → `HTTP 200`.

- [ ] **Step 4: Stop the dev server (Ctrl-C) and commit any lockfile changes**

```bash
cd /home/chopen/Swing
git add package-lock.json
git commit -m "chore: lockfile after workspace install" || echo "no lockfile changes"
```

---

## Phase 2: Migration Framework Core

Goal: Implement the migration runner in `@swing/shared/migrations` with TDD. Each task adds one capability backed by a test against a real Postgres.

### Task 6: Add test helpers for ephemeral schemas

**Files:**
- Create: `shared/tests/migrations/helpers.js`

- [ ] **Step 1: Create the helpers file**

```javascript
// shared/tests/migrations/helpers.js
//
// Test helpers for the migration runner. Each test creates a uniquely-named
// schema in the configured Postgres, runs against it, and drops it after.
//
// Tests require TEST_POSTGRES_URL env var pointing at a writable Postgres
// (typically the same swing_dev instance used for app dev).

const { Client } = require('pg');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function requireTestUrl() {
  const url = process.env.TEST_POSTGRES_URL;
  if (!url) {
    throw new Error(
      'TEST_POSTGRES_URL is not set. Set it to a Postgres URL (e.g. ' +
        'postgresql://swing:swing_dev_2026@localhost:5432/swing_dev).'
    );
  }
  return url;
}

async function createEphemeralSchema() {
  const url = requireTestUrl();
  const schema = 'test_' + crypto.randomBytes(6).toString('hex');
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  return { client, schema, url };
}

async function dropEphemeralSchema(ctx) {
  await ctx.client.query(`DROP SCHEMA "${ctx.schema}" CASCADE`);
  await ctx.client.end();
}

async function makeMigrationsDir(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'swing-mig-'));
  for (const { name, sql } of files) {
    await fs.writeFile(path.join(dir, name), sql, 'utf8');
  }
  return dir;
}

async function rmDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

module.exports = {
  createEphemeralSchema,
  dropEphemeralSchema,
  makeMigrationsDir,
  rmDir,
};
```

- [ ] **Step 2: Commit**

```bash
cd /home/chopen/Swing
git add shared/tests/migrations/helpers.js
git commit -m "test: add ephemeral-schema helpers for migration tests"
```

### Task 7: Test + implement `runMigrations` for a single migration on a fresh schema

**Files:**
- Create: `shared/tests/migrations/runner.test.js`
- Create: `shared/src/migrations/runner.js`
- Modify: `shared/src/migrations/index.js`

- [ ] **Step 1: Write the failing test**

`shared/tests/migrations/runner.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const { runMigrations } = require('../../src/migrations/runner');
const {
  createEphemeralSchema,
  dropEphemeralSchema,
  makeMigrationsDir,
  rmDir,
} = require('./helpers');

test('applies a single SQL migration to a fresh schema', async (t) => {
  const ctx = await createEphemeralSchema();
  const dir = await makeMigrationsDir([
    {
      name: '20260101000001-create-foo.sql',
      sql: `CREATE TABLE "${ctx.schema}".foo (id INT);`,
    },
  ]);
  t.after(async () => {
    await dropEphemeralSchema(ctx);
    await rmDir(dir);
  });

  await runMigrations({
    connectionString: ctx.url,
    migrationsDir: dir,
    schema: ctx.schema,
  });

  const result = await ctx.client.query(
    `SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'foo'`,
    [ctx.schema]
  );
  assert.strictEqual(result.rows.length, 1, 'foo table should exist after migration');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /home/chopen/Swing/shared
TEST_POSTGRES_URL="postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" npm test
```

Expected: FAIL with `Cannot find module '../../src/migrations/runner'` or similar.

- [ ] **Step 3: Implement the minimal runner**

`shared/src/migrations/runner.js`:

```javascript
// @swing/shared/migrations — migration runner.
//
// Reads .sql files from a directory in lexical order, applies any not yet
// recorded in <schema>._migrations to the target Postgres schema, and
// records each as applied. Forward-only.

const { Client } = require('pg');
const fs = require('node:fs/promises');
const path = require('node:path');

async function runMigrations({ connectionString, migrationsDir, schema }) {
  if (!connectionString) throw new Error('connectionString is required');
  if (!migrationsDir) throw new Error('migrationsDir is required');
  if (!schema) throw new Error('schema is required');

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await ensureMigrationsTable(client, schema);
    const applied = await listApplied(client, schema);
    const pending = await listPending(migrationsDir, applied);
    for (const mig of pending) {
      const sql = await fs.readFile(path.join(migrationsDir, mig.name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "${schema}"._migrations(name, applied_at)
             VALUES ($1, NOW())`,
          [mig.name]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${mig.name} failed: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function ensureMigrationsTable(client, schema) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}"._migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listApplied(client, schema) {
  const { rows } = await client.query(
    `SELECT name FROM "${schema}"._migrations`
  );
  return new Set(rows.map((r) => r.name));
}

async function listPending(dir, applied) {
  const entries = await fs.readdir(dir);
  return entries
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .filter((n) => !applied.has(n))
    .map((name) => ({ name }));
}

module.exports = { runMigrations };
```

- [ ] **Step 4: Wire the public API**

`shared/src/migrations/index.js`:

```javascript
const { runMigrations } = require('./runner');
module.exports = { runMigrations };
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
cd /home/chopen/Swing/shared
TEST_POSTGRES_URL="postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" npm test
```

Expected: PASS — `applies a single SQL migration to a fresh schema`.

- [ ] **Step 6: Commit**

```bash
cd /home/chopen/Swing
git add shared/src/migrations/ shared/tests/migrations/runner.test.js
git commit -m "feat(shared/migrations): apply single SQL migration to fresh schema"
```

### Task 8: Test + verify already-applied migrations are skipped (idempotency)

**Files:**
- Modify: `shared/tests/migrations/runner.test.js`

- [ ] **Step 1: Add a failing idempotency test**

Append to `shared/tests/migrations/runner.test.js`:

```javascript
test('skips migrations already recorded in _migrations', async (t) => {
  const ctx = await createEphemeralSchema();
  const dir = await makeMigrationsDir([
    {
      name: '20260101000001-create-foo.sql',
      sql: `CREATE TABLE "${ctx.schema}".foo (id INT);`,
    },
  ]);
  t.after(async () => {
    await dropEphemeralSchema(ctx);
    await rmDir(dir);
  });

  // First run: applies the migration.
  await runMigrations({
    connectionString: ctx.url,
    migrationsDir: dir,
    schema: ctx.schema,
  });

  // Second run: must not re-apply (would error because table already exists
  // with same DDL — runner must check _migrations and skip).
  await runMigrations({
    connectionString: ctx.url,
    migrationsDir: dir,
    schema: ctx.schema,
  });

  // Verify _migrations has exactly one row.
  const r = await ctx.client.query(
    `SELECT count(*)::int AS n FROM "${ctx.schema}"._migrations`
  );
  assert.strictEqual(r.rows[0].n, 1, 'migration should be recorded exactly once');
});
```

- [ ] **Step 2: Run the test to confirm it passes (skip logic already implemented in Task 7)**

```bash
cd /home/chopen/Swing/shared
TEST_POSTGRES_URL="postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" npm test
```

Expected: both tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /home/chopen/Swing
git add shared/tests/migrations/runner.test.js
git commit -m "test(shared/migrations): verify idempotency on repeat runs"
```

### Task 9: Test + verify migrations apply in lexical (timestamp) order

**Files:**
- Modify: `shared/tests/migrations/runner.test.js`

- [ ] **Step 1: Add a failing ordering test**

Append to `shared/tests/migrations/runner.test.js`:

```javascript
test('applies migrations in lexical filename order', async (t) => {
  const ctx = await createEphemeralSchema();
  const dir = await makeMigrationsDir([
    // Note: written out-of-order on disk; runner must sort by name.
    {
      name: '20260101000002-add-bar-column.sql',
      sql: `ALTER TABLE "${ctx.schema}".foo ADD COLUMN bar TEXT;`,
    },
    {
      name: '20260101000001-create-foo.sql',
      sql: `CREATE TABLE "${ctx.schema}".foo (id INT);`,
    },
  ]);
  t.after(async () => {
    await dropEphemeralSchema(ctx);
    await rmDir(dir);
  });

  await runMigrations({
    connectionString: ctx.url,
    migrationsDir: dir,
    schema: ctx.schema,
  });

  // Both should be applied; foo table should have a bar column.
  const r = await ctx.client.query(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'foo'
       ORDER BY column_name`,
    [ctx.schema]
  );
  const cols = r.rows.map((row) => row.column_name);
  assert.deepStrictEqual(cols, ['bar', 'id']);
});
```

- [ ] **Step 2: Run the test**

```bash
cd /home/chopen/Swing/shared
TEST_POSTGRES_URL="postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" npm test
```

Expected: all three tests PASS (the runner already sorts via `entries.sort()` from Task 7).

- [ ] **Step 3: Commit**

```bash
cd /home/chopen/Swing
git add shared/tests/migrations/runner.test.js
git commit -m "test(shared/migrations): verify lexical-order application"
```

### Task 10: Test + implement transactional rollback on a failing migration

**Files:**
- Modify: `shared/tests/migrations/runner.test.js`

- [ ] **Step 1: Add a failing-migration test**

Append to `shared/tests/migrations/runner.test.js`:

```javascript
test('rolls back and aborts on a failing migration', async (t) => {
  const ctx = await createEphemeralSchema();
  const dir = await makeMigrationsDir([
    {
      name: '20260101000001-create-foo.sql',
      sql: `CREATE TABLE "${ctx.schema}".foo (id INT);`,
    },
    {
      name: '20260101000002-bad-sql.sql',
      sql: `THIS IS NOT VALID SQL;`,
    },
    {
      name: '20260101000003-create-baz.sql',
      sql: `CREATE TABLE "${ctx.schema}".baz (id INT);`,
    },
  ]);
  t.after(async () => {
    await dropEphemeralSchema(ctx);
    await rmDir(dir);
  });

  await assert.rejects(
    runMigrations({
      connectionString: ctx.url,
      migrationsDir: dir,
      schema: ctx.schema,
    }),
    /20260101000002-bad-sql\.sql failed/
  );

  // foo should exist (first migration committed).
  const fooR = await ctx.client.query(
    `SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'foo'`,
    [ctx.schema]
  );
  assert.strictEqual(fooR.rows.length, 1);

  // baz should NOT exist (third migration never ran because second failed).
  const bazR = await ctx.client.query(
    `SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'baz'`,
    [ctx.schema]
  );
  assert.strictEqual(bazR.rows.length, 0);

  // _migrations should record only the first migration.
  const mR = await ctx.client.query(
    `SELECT name FROM "${ctx.schema}"._migrations ORDER BY name`
  );
  assert.deepStrictEqual(mR.rows.map((r) => r.name), [
    '20260101000001-create-foo.sql',
  ]);
});
```

- [ ] **Step 2: Run the test (transactional rollback already implemented in Task 7)**

```bash
cd /home/chopen/Swing/shared
TEST_POSTGRES_URL="postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" npm test
```

Expected: all four tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /home/chopen/Swing
git add shared/tests/migrations/runner.test.js
git commit -m "test(shared/migrations): verify rollback on failing migration"
```

### Task 11: Test + implement `pg_advisory_lock` for concurrent-run safety

**Files:**
- Modify: `shared/src/migrations/runner.js`
- Modify: `shared/tests/migrations/runner.test.js`

- [ ] **Step 1: Write the failing concurrent-run test**

Append to `shared/tests/migrations/runner.test.js`:

```javascript
test('concurrent runs serialize via advisory lock', async (t) => {
  const ctx = await createEphemeralSchema();
  // A migration that inserts a row with a sleep, so we can detect
  // interleaving if the lock fails.
  const dir = await makeMigrationsDir([
    {
      name: '20260101000001-slow.sql',
      sql: `
        CREATE TABLE "${ctx.schema}".trace (i INT, t TIMESTAMPTZ);
        INSERT INTO "${ctx.schema}".trace VALUES (1, clock_timestamp());
        SELECT pg_sleep(0.5);
        INSERT INTO "${ctx.schema}".trace VALUES (2, clock_timestamp());
      `,
    },
  ]);
  t.after(async () => {
    await dropEphemeralSchema(ctx);
    await rmDir(dir);
  });

  // Fire two concurrent runs. Without the lock, the second would race ahead
  // and try to apply the same migration (and fail uniqueness on _migrations,
  // OR fail the CREATE TABLE because the first hasn't committed). With the
  // lock, the second waits and sees the migration already applied.
  const r1 = runMigrations({
    connectionString: ctx.url, migrationsDir: dir, schema: ctx.schema,
  });
  const r2 = runMigrations({
    connectionString: ctx.url, migrationsDir: dir, schema: ctx.schema,
  });
  await Promise.all([r1, r2]);

  const m = await ctx.client.query(
    `SELECT count(*)::int AS n FROM "${ctx.schema}"._migrations`
  );
  assert.strictEqual(m.rows[0].n, 1, 'migration recorded once');

  const tr = await ctx.client.query(
    `SELECT count(*)::int AS n FROM "${ctx.schema}".trace`
  );
  assert.strictEqual(tr.rows[0].n, 2, 'migration body executed once');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/chopen/Swing/shared
TEST_POSTGRES_URL="postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" npm test
```

Expected: FAIL — without the lock, one run will collide.

- [ ] **Step 3: Add advisory locking to `runner.js`**

Edit `shared/src/migrations/runner.js`. First, add a `crypto` import at the top of the file alongside the existing imports:

```javascript
const crypto = require('node:crypto');
```

Then replace the `runMigrations` function with:

```javascript
async function runMigrations({ connectionString, migrationsDir, schema }) {
  if (!connectionString) throw new Error('connectionString is required');
  if (!migrationsDir) throw new Error('migrationsDir is required');
  if (!schema) throw new Error('schema is required');

  const client = new Client({ connectionString });
  await client.connect();
  try {
    // Deterministic int64 lock id derived from "swing-migrations" + schema.
    const lockId = lockIdFor(schema);
    await client.query('SELECT pg_advisory_lock($1)', [lockId]);
    try {
      await ensureMigrationsTable(client, schema);
      const applied = await listApplied(client, schema);
      const pending = await listPending(migrationsDir, applied);
      for (const mig of pending) {
        const sql = await fs.readFile(path.join(migrationsDir, mig.name), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            `INSERT INTO "${schema}"._migrations(name, applied_at)
               VALUES ($1, NOW())`,
            [mig.name]
          );
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw new Error(`migration ${mig.name} failed: ${err.message}`);
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
  } finally {
    await client.end();
  }
}

// Hash a string into a stable signed bigint compatible with pg_advisory_lock.
function lockIdFor(schema) {
  const h = crypto.createHash('sha256').update('swing-migrations:' + schema).digest();
  // Take 8 bytes, interpret as signed bigint.
  const buf = h.subarray(0, 8);
  // Build an int64 — postgres advisory lock takes a signed bigint; stay within range.
  const big = buf.readBigInt64BE(0);
  return big.toString();
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /home/chopen/Swing/shared
TEST_POSTGRES_URL="postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" npm test
```

Expected: all five tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/chopen/Swing
git add shared/src/migrations/runner.js shared/tests/migrations/runner.test.js
git commit -m "feat(shared/migrations): serialize concurrent runs via pg_advisory_lock"
```

### Task 12: Test + implement `migrationStatus` for listing applied / pending

**Files:**
- Modify: `shared/src/migrations/runner.js`
- Modify: `shared/src/migrations/index.js`
- Modify: `shared/tests/migrations/runner.test.js`

- [ ] **Step 1: Write the failing status test**

Append to `shared/tests/migrations/runner.test.js`:

```javascript
const { migrationStatus } = require('../../src/migrations');

test('migrationStatus reports applied and pending separately', async (t) => {
  const ctx = await createEphemeralSchema();
  const dir = await makeMigrationsDir([
    {
      name: '20260101000001-create-foo.sql',
      sql: `CREATE TABLE "${ctx.schema}".foo (id INT);`,
    },
    {
      name: '20260101000002-create-bar.sql',
      sql: `CREATE TABLE "${ctx.schema}".bar (id INT);`,
    },
  ]);
  t.after(async () => {
    await dropEphemeralSchema(ctx);
    await rmDir(dir);
  });

  // Before any run: both pending.
  const before = await migrationStatus({
    connectionString: ctx.url,
    migrationsDir: dir,
    schema: ctx.schema,
  });
  assert.deepStrictEqual(before.applied, []);
  assert.deepStrictEqual(before.pending, [
    '20260101000001-create-foo.sql',
    '20260101000002-create-bar.sql',
  ]);

  // After a run: both applied.
  await runMigrations({
    connectionString: ctx.url,
    migrationsDir: dir,
    schema: ctx.schema,
  });
  const after = await migrationStatus({
    connectionString: ctx.url,
    migrationsDir: dir,
    schema: ctx.schema,
  });
  assert.deepStrictEqual(after.applied, [
    '20260101000001-create-foo.sql',
    '20260101000002-create-bar.sql',
  ]);
  assert.deepStrictEqual(after.pending, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/chopen/Swing/shared
TEST_POSTGRES_URL="postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" npm test
```

Expected: FAIL — `migrationStatus is not a function`.

- [ ] **Step 3: Implement `migrationStatus` in `runner.js`**

Append to `shared/src/migrations/runner.js`:

```javascript
async function migrationStatus({ connectionString, migrationsDir, schema }) {
  if (!connectionString) throw new Error('connectionString is required');
  if (!migrationsDir) throw new Error('migrationsDir is required');
  if (!schema) throw new Error('schema is required');

  const client = new Client({ connectionString });
  await client.connect();
  try {
    // ensure the table exists so listApplied doesn't error on a fresh schema
    await ensureMigrationsTable(client, schema);
    const applied = await listApplied(client, schema);
    const entries = (await fs.readdir(migrationsDir))
      .filter((n) => n.endsWith('.sql'))
      .sort();
    return {
      applied: entries.filter((n) => applied.has(n)),
      pending: entries.filter((n) => !applied.has(n)),
    };
  } finally {
    await client.end();
  }
}
```

Update the module.exports at the bottom of `runner.js` to:

```javascript
module.exports = { runMigrations, migrationStatus };
```

- [ ] **Step 4: Re-export from `shared/src/migrations/index.js`**

```javascript
const { runMigrations, migrationStatus } = require('./runner');
module.exports = { runMigrations, migrationStatus };
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /home/chopen/Swing/shared
TEST_POSTGRES_URL="postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" npm test
```

Expected: all six tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/chopen/Swing
git add shared/src/migrations/ shared/tests/migrations/runner.test.js
git commit -m "feat(shared/migrations): migrationStatus() lists applied/pending"
```

---

## Phase 3: CLI for Migrations

Goal: Provide a generic CLI inside `@swing/shared` that per-package wrappers can call.

### Task 13: Implement the generic CLI in `@swing/shared`

**Files:**
- Create: `shared/src/migrations/cli.js`

- [ ] **Step 1: Create the CLI**

`shared/src/migrations/cli.js`:

```javascript
#!/usr/bin/env node
// @swing/shared/migrations/cli — generic CLI consumed by per-package wrappers.
//
// Usage (wrapped by per-package script):
//   node cli.js up      <migrationsDir> <schema> <connectionString>
//   node cli.js status  <migrationsDir> <schema> <connectionString>

const path = require('node:path');
const { runMigrations, migrationStatus } = require('./runner');

async function main(argv) {
  const [cmd, dirArg, schemaArg, urlArg] = argv;
  if (!cmd || !dirArg || !schemaArg) {
    console.error('Usage: cli.js <up|status> <migrationsDir> <schema> [connectionString]');
    process.exit(2);
  }
  const migrationsDir = path.resolve(dirArg);
  const schema = schemaArg;
  const connectionString = urlArg || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error('connectionString missing — pass as 4th arg or set POSTGRES_URL');
    process.exit(2);
  }

  if (cmd === 'up') {
    await runMigrations({ connectionString, migrationsDir, schema });
    console.log('migrations: up to date');
  } else if (cmd === 'status') {
    const s = await migrationStatus({ connectionString, migrationsDir, schema });
    console.log(`schema:  ${schema}`);
    console.log(`applied: ${s.applied.length}`);
    for (const n of s.applied) console.log(`  ✓ ${n}`);
    console.log(`pending: ${s.pending.length}`);
    for (const n of s.pending) console.log(`  · ${n}`);
  } else {
    console.error(`unknown command: ${cmd}`);
    process.exit(2);
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the CLI to `shared/package.json` exports and bin (optional)**

No changes needed — the CLI is invoked by per-package wrappers via direct `node` calls.

- [ ] **Step 3: Commit**

```bash
cd /home/chopen/Swing
git add shared/src/migrations/cli.js
git commit -m "feat(shared/migrations): generic CLI for up/status"
```

### Task 14: Add a per-package wrapper in `apps/casual-fan/`

**Files:**
- Create: `apps/casual-fan/scripts/migrate.js`

- [ ] **Step 1: Create the wrapper**

`apps/casual-fan/scripts/migrate.js`:

```javascript
#!/usr/bin/env node
// Per-package migration CLI wrapper for apps/casual-fan.
// Targets the Postgres schema 'public' (until the schema-per-sport reorg).

const path = require('node:path');

const cmd = process.argv[2] || 'up';
const migrationsDir = path.join(__dirname, '..', 'migrations');
const schema = 'public';
const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
  console.error('POSTGRES_URL is not set. Did you use --env-file=.env.local ?');
  process.exit(2);
}

// Re-exec the shared CLI with positional args.
require('child_process').spawn(
  process.execPath,
  [
    require.resolve('@swing/shared/migrations/cli'),
    cmd,
    migrationsDir,
    schema,
    connectionString,
  ],
  { stdio: 'inherit' }
).on('exit', (code) => process.exit(code ?? 0));
```

Note: this requires `@swing/shared` to expose the CLI path. Update `shared/package.json` exports:

- [ ] **Step 2: Update `shared/package.json` to expose the CLI**

Replace the `exports` block with:

```json
"exports": {
  ".": "./src/index.js",
  "./migrations": "./src/migrations/index.js",
  "./migrations/cli": "./src/migrations/cli.js"
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/chopen/Swing
git add apps/casual-fan/scripts/migrate.js shared/package.json
git commit -m "feat(casual-fan): add migrate.js CLI wrapper around @swing/shared"
```

### Task 15: Smoke-test the CLI on the existing dev DB

**Files:** none modified

- [ ] **Step 1: Create the empty migrations directory (will be filled in Phase 4)**

```bash
cd /home/chopen/Swing
mkdir -p apps/casual-fan/migrations
touch apps/casual-fan/migrations/.gitkeep
```

- [ ] **Step 2: Run `migrate:status` against the existing dev DB**

```bash
cd /home/chopen/Swing/apps/casual-fan
npm run migrate:status
```

Expected output:
```
schema:  public
applied: 0
pending: 0
```

(The runner creates `public._migrations` if missing. Pending is 0 because migrations dir is empty.)

- [ ] **Step 3: Verify `_migrations` table now exists in the dev DB**

```bash
psql "postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" -c "\dt public._migrations"
```

Expected: one row showing the `_migrations` table.

- [ ] **Step 4: Commit the .gitkeep**

```bash
cd /home/chopen/Swing
git add apps/casual-fan/migrations/.gitkeep
git commit -m "chore(casual-fan): scaffold migrations/ directory"
```

---

## Phase 4: Convert Existing `initDb()` to Versioned Migrations

Goal: Capture the schema currently created by `app/lib/db.js::initDb()` as migration `0001-baseline.sql` using `IF NOT EXISTS` so it is a no-op on dev DBs that already have the schema. Then remove `initDb()` from app code.

### Task 16: Read the current schema from `lib/db.js::initDb()`

**Files:** none modified (read-only)

- [ ] **Step 1: Inspect the current `initDb` function**

```bash
cd /home/chopen/Swing
sed -n '1,200p' apps/casual-fan/lib/db.js
```

Note the full DDL for: `users`, `subscriptions`, `alert_history`, `team_mvix`, `player_swing_impact`, `game_odds`, `alert_logs`. (Do not edit yet — Task 17 transcribes them into the migration file.)

### Task 17: Write the baseline migration

**Files:**
- Create: `apps/casual-fan/migrations/20260428000001-baseline.sql`

- [ ] **Step 1: Transcribe the DDL from `initDb()` into the migration file**

Read `apps/casual-fan/lib/db.js` and copy each `CREATE TABLE IF NOT EXISTS ...` block verbatim into a single SQL file:

```bash
cd /home/chopen/Swing
cat apps/casual-fan/lib/db.js | grep -A 100 "CREATE TABLE"
```

Then create `apps/casual-fan/migrations/20260428000001-baseline.sql` with the contents (verbatim DDL from each `await client.query(\` ... \`);` call), preserving column types and constraints exactly. The file should look like:

```sql
-- Baseline: capture the schema previously created by initDb().
-- Uses IF NOT EXISTS so it is a no-op on dev DBs that already have the schema
-- restored from prod. Future migrations replace ALTER-then-recreate patterns
-- with explicit forward changes.

CREATE TABLE IF NOT EXISTS users (
  -- TRANSCRIBE COLUMNS FROM lib/db.js initDb() users-block VERBATIM
);

CREATE TABLE IF NOT EXISTS subscriptions (
  -- TRANSCRIBE COLUMNS FROM lib/db.js initDb() subscriptions-block VERBATIM
);

CREATE TABLE IF NOT EXISTS alert_history (
  -- TRANSCRIBE COLUMNS FROM lib/db.js initDb() alert_history-block VERBATIM
);

CREATE TABLE IF NOT EXISTS team_mvix (
  -- TRANSCRIBE COLUMNS FROM lib/db.js initDb() team_mvix-block VERBATIM
);

CREATE TABLE IF NOT EXISTS player_swing_impact (
  -- TRANSCRIBE COLUMNS FROM lib/db.js initDb() player_swing_impact-block VERBATIM
);

CREATE TABLE IF NOT EXISTS game_odds (
  -- TRANSCRIBE COLUMNS FROM lib/db.js initDb() game_odds-block VERBATIM
);

CREATE TABLE IF NOT EXISTS alert_logs (
  -- TRANSCRIBE COLUMNS FROM lib/db.js initDb() alert_logs-block VERBATIM
);
```

**Important:** the comment placeholders above are marker text only. The engineer must literally copy each `CREATE TABLE IF NOT EXISTS …` block out of `apps/casual-fan/lib/db.js` and paste it into the migration file. Do not infer column shapes — copy verbatim.

- [ ] **Step 2: Verify the file is valid SQL by running `migrate:up` on a fresh ephemeral DB**

```bash
psql "postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" -c \
  "CREATE DATABASE swing_baseline_test;"
POSTGRES_URL="postgresql://swing:swing_dev_2026@localhost:5432/swing_baseline_test" \
  npm run migrate:up --workspace=@swing/casual-fan
psql "postgresql://swing:swing_dev_2026@localhost:5432/swing_baseline_test" -c "\dt"
```

Expected: 7 application tables + `_migrations` listed.

- [ ] **Step 3: Drop the test DB**

```bash
psql "postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" -c \
  "DROP DATABASE swing_baseline_test;"
```

- [ ] **Step 4: Run `migrate:up` on the existing dev DB (should be idempotent)**

```bash
cd /home/chopen/Swing/apps/casual-fan
npm run migrate:up
```

Expected:
- IF NOT EXISTS makes the DDL no-op (data preserved)
- `_migrations` records `20260428000001-baseline.sql` as applied
- `npm run migrate:status` now shows it under `applied:`

- [ ] **Step 5: Verify dev DB still has all rows**

```bash
psql "postgresql://swing:swing_dev_2026@localhost:5432/swing_dev" \
  -c "SELECT count(*) FROM team_mvix;"
```

Expected: 12550 (matches earlier count).

- [ ] **Step 6: Commit**

```bash
cd /home/chopen/Swing
git add apps/casual-fan/migrations/20260428000001-baseline.sql
git commit -m "feat(casual-fan): capture baseline schema as migration 0001"
```

### Task 18: Remove `initDb()` from `lib/db.js` and from any callers

**Files:**
- Modify: `apps/casual-fan/lib/db.js`
- Modify: `apps/casual-fan/app/api/db/init/route.js`

- [ ] **Step 1: Read `apps/casual-fan/lib/db.js` to find `initDb`**

```bash
cd /home/chopen/Swing
grep -n "initDb\|CREATE TABLE" apps/casual-fan/lib/db.js
```

- [ ] **Step 2: Remove the `initDb` function and its export from `lib/db.js`**

Edit `apps/casual-fan/lib/db.js`: delete the `async function initDb()` definition and its DDL. Remove `initDb` from any `module.exports` block. Other exported helpers (the `sql` template tag, etc.) stay.

- [ ] **Step 3: Replace `app/api/db/init/route.js` with a deprecation response**

`apps/casual-fan/app/api/db/init/route.js` — replace the entire file with:

```javascript
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      deprecated: true,
      message:
        'initDb() is deprecated. Use `npm run migrate:up` to apply schema changes.',
    },
    { status: 410 }
  );
}
```

- [ ] **Step 4: Search for any other callers of `initDb`**

```bash
cd /home/chopen/Swing
grep -rn "initDb" apps/casual-fan/ shared/ 2>/dev/null
```

Expected: no matches (only the deprecation message in `route.js`). If any are found, remove them.

- [ ] **Step 5: Restart the dev server and verify routes still work**

```bash
cd /home/chopen/Swing
npm run dev &
sleep 3
curl -sS -o /dev/null -w "/        HTTP %{http_code}\n" http://localhost:4000/
curl -sS -o /dev/null -w "/api/dates HTTP %{http_code}\n" http://localhost:4000/api/dates
curl -sS -w "/api/db/init HTTP %{http_code}\n" -o /tmp/init-resp.json http://localhost:4000/api/db/init
cat /tmp/init-resp.json
kill %1
```

Expected:
```
/        HTTP 200
/api/dates HTTP 200
/api/db/init HTTP 410
{"deprecated":true,"message":"initDb() is deprecated. Use `npm run migrate:up` to apply schema changes."}
```

- [ ] **Step 6: Commit**

```bash
cd /home/chopen/Swing
git add apps/casual-fan/lib/db.js apps/casual-fan/app/api/db/init/route.js
git commit -m "refactor(casual-fan): remove initDb(); use migrate:up instead"
```

---

## Phase 5: Documentation Updates

### Task 19: Update `docs/dev-setup.md` for the new layout and migration workflow

**Files:**
- Modify: `docs/dev-setup.md`

- [ ] **Step 1: Update path references and add the migration step**

Open `docs/dev-setup.md`. Make these specific edits:

1. Replace any `cd app && npm install` with `npm install` (now run from repo root via workspaces).
2. Replace `cd app && npm run dev` with `npm run dev` (workspace root delegates to `@swing/casual-fan`).
3. Replace path references like `app/.env.local` with `apps/casual-fan/.env.local` throughout.
4. Replace path references like `app/lib/db.js::initDb()` with **a reference to `apps/casual-fan/migrations/`** in the "schema is created lazily" paragraph (§ 2). The new wording:

   > The schema is managed by versioned migrations under `apps/casual-fan/migrations/`. Run `npm run migrate:up --workspace=@swing/casual-fan` to apply pending migrations. The first run on a fresh DB creates all tables; subsequent runs are idempotent.

5. In § 4 "Run the app", add the migration step before `npm run dev`:

   ```bash
   # Apply DB migrations (first time + after pulling new schema changes)
   npm run migrate:up --workspace=@swing/casual-fan

   # Start dev server
   npm run dev
   ```

6. Add a Troubleshooting entry "Migration failed":

   > If `migrate:up` fails partway, fix the failing SQL in the migration file and re-run. The runner is transactional per migration — failed migrations do not partial-apply. If a migration's SQL needs to change after it has been applied on a teammate's machine, write a new forward-only migration rather than editing the historical one.

- [ ] **Step 2: Commit**

```bash
cd /home/chopen/Swing
git add docs/dev-setup.md
git commit -m "docs: update dev-setup for monorepo + migration workflow"
```

### Task 20: Add a `shared/migrations/README.md`

**Files:**
- Create: `shared/src/migrations/README.md`

- [ ] **Step 1: Write the README**

`shared/src/migrations/README.md`:

````markdown
# `@swing/shared/migrations`

Thin, schema-aware migration runner for the Swing monorepo. Forward-only,
serialized via `pg_advisory_lock`, tracks applied migrations in
`<schema>._migrations`.

## File naming

`<YYYYMMDDHHMMSS>-<slug>.sql`

Example: `20260428000001-baseline.sql`

The runner sorts by filename, so the timestamp prefix determines order.

## SQL files

Plain SQL. The runner wraps each file in `BEGIN`/`COMMIT`. Statements within
a file run in one transaction. Use `IF NOT EXISTS` only in baseline migrations
that need to no-op on existing DBs; once a migration is applied somewhere,
edit it never — write a new forward migration instead.

## Per-package usage

Each consuming package writes a thin CLI wrapper (e.g.
`apps/casual-fan/scripts/migrate.js`) that invokes
`@swing/shared/migrations/cli` with a fixed `migrationsDir` and `schema`.

```bash
# In apps/casual-fan
npm run migrate:up      # apply pending migrations
npm run migrate:status  # show applied/pending
```

## Programmatic API

```javascript
const { runMigrations, migrationStatus } = require('@swing/shared/migrations');

await runMigrations({
  connectionString: process.env.POSTGRES_URL,
  migrationsDir: '/abs/path/to/migrations',
  schema: 'public',
});

const status = await migrationStatus({
  connectionString: process.env.POSTGRES_URL,
  migrationsDir: '/abs/path/to/migrations',
  schema: 'public',
});
// → { applied: [...], pending: [...] }
```

## Concurrency

Two concurrent `runMigrations` calls against the same `(connection, schema)`
serialize via `pg_advisory_lock` keyed off a SHA-256 of the schema name.
The second caller waits, observes that pending migrations are now applied,
and exits cleanly.

## Forward-only

There is no `down`. To revert a change, write a new migration that reverses
it. Rationale: dev DBs are restored from prod (one-way), so rollback locally
is unnecessary; in prod, forward-only avoids the operational hazard of
running revert SQL against live data.
````

- [ ] **Step 2: Commit**

```bash
cd /home/chopen/Swing
git add shared/src/migrations/README.md
git commit -m "docs(shared/migrations): add module README"
```

---

## Self-Review Notes

Run after the plan is fully written, not as part of execution.

**Spec coverage check** (Plan A scope, against `2026-04-28-data-lifecycle-environments-design.md`):

| Spec section | Implemented in |
|---|---|
| § 3.2 Repo strategy: monorepo with per-core packages | Phase 1 (Tasks 1–5) |
| § 6 row "`initDb()` → versioned migration framework" | Phase 2 + Phase 4 (Tasks 6–18) |
| § 5 #4 "Migration tool: custom thin layer in `shared/`" | Resolved: yes (Phase 2) |

**Out-of-scope** (deferred to later plans):
- Schema-per-sport reorganization → Plan B
- Algorithm versioning columns → Plan B
- Backfill orchestrator → Plan C
- Retention framework → Plan D
- Game state machine + source failure → Plan E

**Type/symbol consistency:**
- `runMigrations`, `migrationStatus`, `lockIdFor`, `ensureMigrationsTable`, `listApplied`, `listPending` — all consistently named across tasks.
- File naming convention `<YYYYMMDDHHMMSS>-<slug>.sql` used uniformly.

**Placeholder scan:** the only `TBD`-shaped placeholder is in Task 17 Step 1, which by design directs the engineer to copy DDL verbatim from the existing `lib/db.js`. This is intentional: the alternative would be transcribing all 7 tables' DDL inline here, with risk of drift from the actual current code. The instruction is explicit and safe.
