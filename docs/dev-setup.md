# Dev Environment Setup

How to bootstrap a local dev environment for The Swing from a clean machine.

Tested on Ubuntu 24.04. macOS notes are inline where they differ.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.x or newer | Next 16 requires Node ≥ 20.18 |
| npm | bundled with Node | |
| PostgreSQL | 14, 15, or 16 | 14 is what's currently in use |
| git | any | |
| build tools | `build-essential` (Linux) / Xcode CLT (macOS) | needed for native deps |

Ubuntu install:

```bash
sudo apt update
sudo apt install -y build-essential git curl postgresql postgresql-contrib
# Node via NodeSource, n, nvm, or asdf — whatever you prefer
```

macOS install (Homebrew):

```bash
brew install git node@20 postgresql@14
brew services start postgresql@14
```

---

## 1. Clone and install

```bash
git clone <repo-url> Swing
cd Swing/app
npm install
```

`npm install` will compile some native modules (`better-sqlite3` is a transitive holdover; the running app uses Postgres). On Linux make sure `build-essential` is installed first or it will fail.

---

## 2. PostgreSQL: role and database

The app expects a Postgres database named `swing_dev` accessible to a role named `swing` over TCP on `localhost:5432`. Defaults assume the standard Ubuntu/Homebrew install — peer auth on the local Unix socket and `scram-sha-256` on TCP loopback.

Create the role and database (Ubuntu — uses peer auth as the `postgres` OS user):

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE swing WITH LOGIN PASSWORD 'change-me-in-dev';
CREATE DATABASE swing_dev OWNER swing;
GRANT ALL PRIVILEGES ON DATABASE swing_dev TO swing;
SQL
```

macOS:

```bash
psql postgres <<'SQL'
CREATE ROLE swing WITH LOGIN PASSWORD 'change-me-in-dev';
CREATE DATABASE swing_dev OWNER swing;
SQL
```

Verify:

```bash
psql "postgresql://swing:change-me-in-dev@localhost:5432/swing_dev" -c '\conninfo'
```

The schema is created lazily — `lib/db.js` exposes an `initDb()` that issues `CREATE TABLE IF NOT EXISTS` for every table. It runs on first hit by app code that needs it. You don't need to run any migrations by hand.

If you want a fully populated dev DB, ask a teammate for a `pg_dump` and restore with:

```bash
pg_restore -h localhost -U swing -d swing_dev path/to/swing_dev.dump
```

---

## 3. Environment variables

Create `app/.env.local`:

```env
POSTGRES_URL=postgresql://swing:change-me-in-dev@localhost:5432/swing_dev
JWT_SECRET=pick-a-long-random-string
```

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `POSTGRES_URL` | yes | — | Postgres connection string used by `lib/db.js` |
| `JWT_SECRET` | recommended | `swing-dev-secret` (insecure) | Signs session tokens; set your own even in dev |

`.env.local` is git-ignored. Do not commit it.

---

## 4. Run the app

```bash
cd app
npm run dev      # starts Next dev server on http://localhost:4000
```

Hot reload is on. API routes live under `app/app/api/**`.

Useful scripts:

```bash
npm run backfill   # node scripts/backfill.js — historical ESPN backfill
npm run analysis   # node scripts/analysis.js — MVIX/MRVI computation
npm run lint
npm run format
```

Backfill note: only college (CBB) games should be backfilled — NBA is always skipped by design. See `scripts/backfill.js`.

---

## 5. Backing up / moving your dev DB

To produce a portable dump (use the version-matched binary if you have multiple Postgres versions installed):

```bash
/usr/lib/postgresql/14/bin/pg_dump -Fc -h localhost -U swing swing_dev \
  -f swing_dev-$(date +%Y%m%d).dump
```

Restore on the target machine after creating an empty `swing_dev`:

```bash
pg_restore -h localhost -U swing -d swing_dev swing_dev-YYYYMMDD.dump
```

---

## Troubleshooting

### Postgres won't start: "private key file ... must be owned by the database user or root"

If you have `xrdp` installed on Ubuntu, it can clobber the system snakeoil SSL key (`/etc/ssl/private/ssl-cert-snakeoil.key`), changing ownership to `xrdp:xrdp`. Postgres then refuses to start because it can't read the key.

Two fixes:

1. **Regenerate the key** (canonical):
   ```bash
   sudo make-ssl-cert generate-default-snakeoil --force-overwrite
   sudo pg_ctlcluster 14 main start
   ```
2. **Disable SSL on the dev cluster** (recommended on a dev box, since loopback-only with self-signed certs isn't real security and xrdp may clobber it again):
   ```bash
   sudo sed -i 's/^ssl = on/ssl = off/' /etc/postgresql/14/main/postgresql.conf
   sudo pg_ctlcluster 14 main restart
   ```

### Multiple Postgres versions installed

Ubuntu can leave 14/15/16 clusters side-by-side after distro upgrades. Inspect with:

```bash
sudo pg_lsclusters
```

The app expects port 5432 (the default for 14). If a different version owns 5432, either point `POSTGRES_URL` at the right port or drop the unused clusters:

```bash
sudo pg_dropcluster 15 main   # only if it has no data you care about
```

### `pg_dump` version mismatch

The default `pg_dump` on PATH may be older than your server. Use the version-matched binary directly:

```bash
ls /usr/lib/postgresql/      # see installed versions
/usr/lib/postgresql/14/bin/pg_dump --version
```

### `psql: connection refused` on port 5432

The cluster isn't running. Check:

```bash
sudo pg_lsclusters
sudo journalctl -xeu postgresql@14-main.service --no-pager | tail -40
```

### Native module build failures during `npm install`

Install `build-essential` (Linux) or Xcode Command Line Tools (`xcode-select --install` on macOS), then re-run `npm install`.

---

## Architecture quick reference

- **Frontend + API:** Next.js 16 App Router (`app/app/`)
- **Data layer:** `app/lib/db.js` — thin `pg.Pool` wrapper exposing a `sql\`\`` template tag
- **Schema:** auto-created via `initDb()` in `lib/db.js` (CREATE TABLE IF NOT EXISTS for every table)
- **External data:** ESPN public scoreboard + summary endpoints (no API key required)
- **Production DB:** Vercel Postgres; locally we connect to plain Postgres with the same `pg` interface

For data flow, momentum math, and analytics specs see the other docs in `/docs`.
