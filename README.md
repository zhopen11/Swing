# The Swing · Live P-B-P Momentum Dashboard

Real-time NBA + NCAA basketball momentum tracker. Computes possession-level momentum from live ESPN play-by-play data — independent of score.

---

## What It Does

- Pulls live scores + play-by-play from ESPN's public API
- Computes a 0–100 momentum score per team from a sliding window of the last 12 possession events
- Persists users, alerts, MVIX/MRVI snapshots, and per-player swing impact in PostgreSQL
- Shows sparkline momentum charts, live play feeds, and three alert tiers:
  - ⚡ **SCORE IS BLUFFING** — score and momentum leaders disagree
  - 👀 **COMEBACK WATCH** — trailing team dominates momentum
  - ⚠️ **SWING WARNING** — tied/close score but momentum is heavily one-sided

---

## Tech Stack

- **Next.js** (App Router) with plain JavaScript and JSX
- **Tailwind CSS** for styling
- **PostgreSQL** for persistence (Vercel Postgres in prod, local Postgres in dev) via `pg`
- **Vercel** for deployment
- **ESPN Public API** for live data (no key required)

---

## Running Locally

First-time setup (Postgres role/db, env vars, troubleshooting): see [`docs/dev-setup.md`](docs/dev-setup.md).

Once your local Postgres has a `swing_dev` database and `app/.env.local` is in place:

```bash
cd app
npm install
npm run dev
```

Then open: [http://localhost:4000](http://localhost:4000)

Hot reload is enabled — changes to components and API routes reflect immediately.

---

## Deployment

The project is configured for **Vercel** with auto-deploy from GitHub.

- **Root directory:** `app/`
- **Live URL:** https://the-swing.vercel.app

To deploy manually:

```bash
vercel deploy --prod
```

---

## Backfill & Analysis

Historical game data can be backfilled from ESPN and analyzed for algorithm accuracy. **Only CBB is backfilled** — NBA is intentionally skipped.

```bash
cd app

# Backfill NCAA games for a date range
npm run backfill -- --league CBB --start 2025-11-03 --end 2026-03-13

# Run analysis on backfill results
npm run analysis -- --league CBB
```

---

## Project Structure

```
app/                          Next.js application
├── app/                      App Router pages and API routes
│   ├── page.js               Dashboard (React)
│   └── api/                  REST API endpoints
│       ├── games/            Game list, detail, momentum, plays, alerts
│       ├── live/             Currently live games with momentum
│       ├── alerts/           Recent alerts across all games
│       └── stats/alerts/     Aggregate alert accuracy
├── lib/                      Shared backend logic
│   ├── config.js             Constants, weights, thresholds
│   ├── momentum.js           Momentum engine (sliding window algorithm)
│   ├── alerts.js             Three-tier alert detection
│   ├── espn.js               ESPN API client
│   └── db.js                 Postgres pool + schema (initDb)
├── scripts/                  CLI tools
│   ├── backfill.js           Historical game backfill
│   └── analysis.js           Post-backfill reporting
└── vercel.json               Vercel deployment config

index.html                    Original standalone dashboard prototype
docs/                         Product overview document generator
archive/python-backend/       Archived Python implementation (reference only)
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/games?date=&league=&status=` | List games with optional filters |
| `GET /api/games/:id` | Single game with momentum and recent plays |
| `GET /api/games/:id/momentum` | Full momentum timeline (chart data) |
| `GET /api/games/:id/plays` | Full play-by-play with possession scores |
| `GET /api/games/:id/alerts` | All alerts for a game |
| `GET /api/live` | All live games with momentum, charts, and alerts |
| `GET /api/alerts?type=&date=` | Recent alerts across all games |
| `GET /api/stats/alerts` | Aggregate alert accuracy from backfill |

---

## How The Momentum Algorithm Works

Each team gets a rolling window of their last **12 possession-level events**, scored as:

| Event | Score |
|-------|-------|
| Makes 3-pointer | +3.0 |
| Misses 3-pointer | −1.2 |
| Makes 2-pointer | +2.0 |
| Misses 2-pointer | −0.8 |
| Makes free throw | +0.8 |
| Misses free throw | −0.4 |
| Turnover | −2.5 |
| Steal | +1.8 |
| Block | +1.2 |
| Offensive rebound | +1.5 |
| Defensive rebound | +0.6 |
| Fast break | +2.5 |

The raw window sum (range −15 to +15) is mapped to a 0–100 scale. Each team's momentum is computed **independently** — momentum is a measure of process, not outcome.

**Halftime freeze:** momentum is locked at the final possession of the first half and held stable during the halftime break. It resumes updating when the second half begins.

---

## Alert Tiers

1. **⚡ SCORE IS BLUFFING** — The team leading on the scoreboard is NOT the team leading in momentum. The score doesn't reflect how the game is actually being played.

2. **👀 COMEBACK WATCH** — The trailing team (by score) has dominant momentum. A run may be coming.

3. **⚠️ SWING WARNING** — The score is close/tied, but one team has overwhelming momentum. The game may break open.

At halftime, detection thresholds tighten because a full half of data provides a more reliable signal.

---

## Data Source

All data is pulled from ESPN's public (unauthenticated) API endpoints:
- `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`
- `site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`
- `site.api.espn.com/apis/site/v2/sports/basketball/{league}/summary?event={id}`

No API key required. Cache-busting is handled via a `_t` timestamp query parameter.

---

## Notes

- **Basketball only.** The algorithm is validated on NBA and NCAA D1 men's basketball. Do not apply to other sports without re-validating signal weights.
- **CBB play attribution:** NCAA play-by-play data uses numeric team IDs rather than abbreviations. The algorithm resolves team identity via ID lookup from the scoreboard.
