# Dev Environment Setup

How to bootstrap a local dev environment for The Swing from a clean machine.

Tested on Ubuntu 24.04. macOS notes are inline where they differ.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.x or newer | Next 16 requires Node ≥ 20.18 |
| npm | bundled with Node | |
| PostgreSQL | 14+ | Ubuntu 24.04 installs PG16 by default; macOS Homebrew is similar. The doc uses `$PG_VER` for version-specific paths — see § 2 |
| git | any | |
| build tools | `build-essential` (Linux) / Xcode CLT (macOS) | needed for native deps |

Ubuntu install:

```bash
sudo apt update
sudo apt install -y build-essential git curl postgresql postgresql-contrib
# Node via NodeSource, n, nvm, or asdf — whatever you prefer
```

macOS install (Homebrew — substitute the major version Homebrew installs for you):

```bash
brew install git node@20 postgresql@16
brew services start postgresql@16
```

---

## 1. Clone and install

```bash
git clone <repo-url> Swing
cd Swing/app
npm install
```

`npm install` will compile some native modules (e.g. `pg`'s deps). On Linux make sure `build-essential` is installed first or it will fail.

---

## 2. PostgreSQL: role and database

The app expects a Postgres database named `swing_dev` accessible to a role named `swing` over TCP on `localhost:5432`. Defaults assume the standard Ubuntu/Homebrew install — peer auth on the local Unix socket and `scram-sha-256` on TCP loopback.

### Pin your Postgres major version

Subsequent commands reference `/etc/postgresql/$PG_VER/main/...` and `/usr/lib/postgresql/$PG_VER/bin/...`. Set the variable once so you can paste commands verbatim:

```bash
PG_VER=$(pg_lsclusters -h | awk 'NR==1{print $1}')
echo "Postgres major version: $PG_VER"
```

Ubuntu 24.04 installs PG16 by default. Other versions are fine — the only thing that matters is that `$PG_VER` matches an actual cluster on your machine.

### Ubuntu + xrdp preflight (skip on macOS or boxes without xrdp)

If `xrdp` is installed on the box, it will (on first start) regenerate `/etc/ssl/private/ssl-cert-snakeoil.key` with `xrdp:xrdp` ownership. Postgres then refuses to start because it can't read the key — startup fails silently from systemd's perspective. This is effectively required preflight on any xrdp-equipped Ubuntu host:

```bash
# Check whether xrdp is on the box
dpkg -l xrdp 2>/dev/null | grep -q '^ii' && echo "xrdp present — apply preflight" || echo "no xrdp — skip"

# If xrdp is present, disable Postgres SSL on the dev cluster (snakeoil certs
# aren't real security on loopback, and xrdp may clobber the key again later).
sudo sed -i 's/^ssl = on/ssl = off/' /etc/postgresql/$PG_VER/main/postgresql.conf
sudo pg_ctlcluster $PG_VER main restart
```

If you'd rather keep SSL on, regenerate the key with proper ownership instead — see Troubleshooting below.

### Create the role and database

Ubuntu (uses peer auth as the `postgres` OS user):

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
| `SPORTRADAR_NHL_KEY` | required for Hockey tab | — | Sportradar NHL API key. The Hockey tab fetches the NHL daily schedule and play-by-play through Sportradar at request time (`app/api/hockey/poll`); without this key the tab renders an empty list (see Troubleshooting → "Hockey tab is empty"). Also needed by the NHL cache/validate scripts (`scripts/sr-nhl-*.js`). The rest of the app — NBA, CBB, analysis, polls — does not depend on it. |

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
npm run backfill        # historical ESPN backfill (CBB only — NBA is skipped by design)
npm run analysis        # MVIX/MRVI computation
npm run sr-compare      # compare ESPN vs Sportradar play-by-play (NBA)
npm run live-compare    # live ESPN/Sportradar comparison
npm run lint
npm run format
```

NHL data scripts (require `SPORTRADAR_NHL_KEY` in your env):

```bash
node scripts/sr-nhl-cache.js      --date 2026-04-19
node scripts/sr-nhl-cache-bulk.js --start 2026-02-01 --end 2026-04-18
node scripts/sr-nhl-validate.js
```

---

## 5. Backing up / moving your dev DB

Two repo scripts wrap `pg_dump` / `pg_restore` and pick a version-matched binary automatically. They read `POSTGRES_URL` from `app/.env.local`.

**Backup** — writes a custom-format (`-Fc`) dump to `<repo>/backups/swing_dev-<timestamp>.dump`:

```bash
cd app
npm run db:backup
```

**Restore** to the database referenced by `POSTGRES_URL` (typically `swing_dev`):

```bash
npm run db:restore -- /path/to/swing_dev-YYYYMMDD-HHMMSS.dump
# clean re-import (drops existing objects first):
npm run db:restore -- /path/to/swing_dev-YYYYMMDD-HHMMSS.dump --clean
```

**Restore into a different DB** — useful for verifying a backup or staging data without touching the live `swing_dev`:

```bash
sudo -u postgres psql -p 5432 -c 'CREATE DATABASE swing_dev_verify OWNER swing;'
npm run db:restore -- /path/to/swing_dev-YYYYMMDD-HHMMSS.dump --target-db swing_dev_verify
sudo -u postgres psql -p 5432 -c 'DROP DATABASE swing_dev_verify;'
```

The `backups/` directory is git-ignored. Both scripts respect `PG_DUMP` / `PG_RESTORE` env vars if you need to override the binary path.

---

## Troubleshooting

### Postgres won't start: "private key file ... must be owned by the database user or root"

`xrdp` installs/regenerates the system snakeoil SSL key (`/etc/ssl/private/ssl-cert-snakeoil.key`) with `xrdp:xrdp` ownership, which Postgres rejects. The xrdp preflight in § 2 turns SSL off to sidestep this. If you want to keep SSL on instead, regenerate the key:

```bash
sudo make-ssl-cert generate-default-snakeoil --force-overwrite
sudo pg_ctlcluster $PG_VER main start
```

Note that xrdp may clobber the key again on its next restart — disabling SSL on the dev cluster is the more durable fix for a dev box.

### Multiple Postgres versions installed

Ubuntu can leave 14/15/16 clusters side-by-side after distro upgrades. Inspect with:

```bash
sudo pg_lsclusters
```

The app expects port 5432. If a different version owns 5432, either point `POSTGRES_URL` at the right port (each cluster gets its own port — 5432, 5433, ...) or drop the unused clusters:

```bash
sudo pg_dropcluster 15 main   # only if it has no data you care about
```

### `pg_dump` version mismatch

The default `pg_dump` on PATH may be older than your server. Use the version-matched binary directly (the `db:backup`/`db:restore` scripts pick this automatically):

```bash
ls /usr/lib/postgresql/      # see installed versions
/usr/lib/postgresql/$PG_VER/bin/pg_dump --version
```

### `psql: connection refused` on port 5432

The cluster isn't running. Check:

```bash
sudo pg_lsclusters
sudo journalctl -xeu postgresql@$PG_VER-main.service --no-pager | tail -40
```

### Native module build failures during `npm install`

Install `build-essential` (Linux) or Xcode Command Line Tools (`xcode-select --install` on macOS), then re-run `npm install`.

### Hockey tab is empty

The Hockey tab silently renders no games when `SPORTRADAR_NHL_KEY` is not set in `app/.env.local`. The poll route (`app/api/hockey/poll`) catches the missing-key error and returns `200` with `games: []`, so the empty UI is visually indistinguishable from "no games today." Check the dev server log for `NHL schedule fetch failed: SPORTRADAR_NHL_KEY is not set` to confirm. Adding the key to `.env.local` and reloading the tab is the fix.

Known UX gap: the route should ideally surface the failure to the client (e.g. a `503` or an explicit `error` field in the JSON) rather than swallowing it. Tracking issue / PR welcome.

---

## Architecture quick reference

- **Frontend + API:** Next.js 16 App Router (`app/app/`)
- **Data layer:** `app/lib/db.js` — thin `pg.Pool` wrapper exposing a `sql\`\`` template tag
- **Schema:** auto-created via `initDb()` in `lib/db.js` (CREATE TABLE IF NOT EXISTS for every table)
- **External data:** ESPN public scoreboard + summary endpoints (no API key required) for NBA and CBB; Sportradar for NHL (requires `SPORTRADAR_NHL_KEY`)
- **Production DB:** Vercel Postgres; locally we connect to plain Postgres with the same `pg` interface

For data flow, momentum math, and analytics specs see the other docs in `/docs`.
