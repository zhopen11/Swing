# Data Lifecycle & Environments

**Status:** Approved design (child #1 of `swing-architecture-overview`)
**Date:** 2026-04-28
**Parent:** [`2026-04-28-swing-architecture-overview.md`](./2026-04-28-swing-architecture-overview.md)
**Scope:** The operational lifecycle layer that lets a new core be brought online with minimal bespoke effort. Covers dev/prod environments, backfill, retention, algorithm versioning, live vs. historical state, and source failure handling.

## 1. Premise

Cores are the per-instance data backends defined in the parent spec. As Swing scales toward full breadth (most major US sports) and full depth (all relevant tiers), the realistic peak is 30–80 active cores. At that scale, what works for 2–3 cores breaks: hand-rolled migrations, ad-hoc backfill scripts, hardcoded retention, untagged metric outputs, silent source failures.

This spec defines the **operational lifecycle layer** — a thin shared template handling all operational mechanics, with rich per-core surfaces for sport-specific concerns. Architectural decisions are made now to avoid retrofit cost later.

## 2. The Thin/Rich Split

Every concern in this spec decomposes into:

- **Shared template** — what the platform provides
- **Per-core contract** — what each core implements

| Sub-topic | Shared template (thin) | Per-core (rich, domain-specific) |
|---|---|---|
| Dev/prod environments | `db:backup`, `db:restore`, env-var conventions, deployment topology | Source key handling, sport-specific feed access |
| Backfill | Restore-from-prod mechanism, generic backfill orchestrator (idempotent, resumable) | Source-specific bulk-fetch, what "historical" means per sport |
| Retention | Policy *framework* (declarative per-table TTL + archive) | Concrete values per table per sport |
| Algorithm versioning | Versioning columns + replay framework | Which algorithms exist, when they bump, replay logic |
| Live vs. historical state | State-machine framework, immutability convention | Concrete states (basketball quarters vs. hockey periods vs. golf rounds) |
| Source failure | Typed error taxonomy, retry/backoff, app-facing failure semantics | Which feed, what failure modes, what cached fallback |

**Where the line moves.** The split itself is a design choice. This spec errs on the side of putting more in the shared template — at 30+ cores, repeated bespoke implementations are the bigger cost.

## 3. Architectural Pins

Decisions made in this spec, not deferred to the implementation plan:

### 3.1 Database isolation: schema-per-sport in one shared Postgres instance

Each sport gets its own Postgres schema (`basketball`, `football`, `hockey`, `golf`, ...) inside a single Postgres instance. Plus a `shared` schema for cross-sport tables (sports, leagues, conferences, divisions, teams, players, coaches, schedules, venues).

**Why:** Postgres-native isolation. Cross-sport joins still possible (e.g. a coach who's worked across sports). Way cheaper than 30+ Postgres clusters. Single backup/restore pipeline. No tenant column required on every row. Schema permissions can be tuned independently if needed.

**Multiple cores per sport.** A sport schema is shared across all cores of that sport (e.g. NBA, NCAA D1 men's, NCAA D1 women's, G-League all live in `basketball`). Per-core distinction is carried via columns on the relevant tables (e.g. a `core_id` foreign key referencing the `shared.cores` registry, populated from the parameter tuple in the parent spec). Within-sport partitioning strategies (table-per-tier, partitioned tables, etc.) are left to the implementation plan.

**Trade-off:** A single Postgres instance is a single point of failure. Acceptable at this scale; revisit if any one sport's volume forces a sharding decision.

### 3.2 Repo strategy: monorepo with per-core packages

A single repo (the existing `Swing` repo) restructured as a workspace with:
- A `shared/` package for the thin template (migration framework, retention framework, source-failure taxonomy, etc.)
- A package per core under `cores/<core-id>/` — `core-id` derived from the core's parameter tuple (convention left to the implementation plan)
- A package per application under `apps/<app-id>/` — e.g. `apps/casual-fan/`, future: `apps/coaches/`, `apps/gambling/`

Tooling: Turborepo or similar. (Final tool and naming-convention choices are implementation-plan territory.)

**Why:** Shared template lives as a library consumed by every core. Cross-cutting changes (e.g. updating the migration framework) are atomic in one PR. Each core stays scoped. Apps can independently depend on one or many cores. Avoids polyrepo coordination tax.

**Trade-off:** Repo grows large. Mitigated by package-level boundaries and CI tooling that runs only what changed.

### 3.3 Algorithm versioning: every derived row is tagged

Every row in any *derived* metric table carries:
- `algo_id` — string identifier of the algorithm (e.g. `mvix-team`, `hdsr-team`, `mrvi-player`)
- `algo_version` — semver or monotonic version string (e.g. `1.2.0`)
- `computed_at` — timestamp the row was computed

**Why:** Cheap to add now (one schema change per derived table). Catastrophic to retrofit. Lets historical comparisons stay valid across algorithm evolution. Makes algorithm replay a query, not a re-ingestion.

**Trade-off:** Three extra columns per derived table. Negligible at the scale of metric data.

## 4. Per-Topic Design

### 4.1 Dev/Prod Environments

**Shared template:**
- `npm run db:backup` / `db:restore` (already exists; promotes from app-only to shared template)
- One-way data flow: prod → dev only. Dev never round-trips to prod.
- Convention: dev backfills from prod **before** commit + tag.
- Per-core env-var conventions (e.g. `<CORE>_POSTGRES_URL`, `<CORE>_SOURCE_KEY`).
- Deployment topology: each core runs as an independent service against the shared Postgres instance.

**Per-core:**
- Source API keys (Sportradar, etc.) with per-core key rotation.
- Sport-specific feed-access patterns (rate limits, auth quirks).

**Open question (deferred to plan):**
- Sandboxed source-API keys for dev (separate from prod) vs. shared keys with rate-limit awareness.

### 4.2 Backfill

**Shared template:**
- A **backfill orchestrator** with these properties:
  - Idempotent: re-running a date range produces the same result
  - Resumable: failure mid-bulk doesn't require restart from zero
  - Progress-tracked: a backfill job has a queryable status
  - Composable: per-source bulk-fetch implementations plug in
- Restore-from-prod is the on-ramp for new dev machines (already implemented as `db:restore`).

**Per-core:**
- Source-specific bulk-fetch implementation (today: `scripts/sr-nhl-cache-bulk.js` for NHL, `scripts/backfill.js` for ESPN/CBB). These get refactored as plugins to the shared orchestrator.
- Per-sport definition of "historical" — how far back to backfill, which seasons.

**Convention:** when a new core is greenlit, the bootstrap path is:
1. Create the per-sport schema and tables
2. Run schedule + roster sync to current
3. Run historical backfill across the desired date range
4. Run derived-metric replay across the same range

### 4.3 Retention

**Shared template:**
- A **declarative retention framework**: each table declares its retention policy in metadata (table comment, schema annotation, or config file).
- An **archiver** runs on a schedule and enforces the declared policies. Default action: move expired rows to an archive schema; secondary action: drop after N years archived.
- Default policy classes (any table picks one):

  | Class | Live retention | Archive retention | Notes |
  |---|---|---|---|
  | `raw-pbp` | 5 years | indefinite | Cheap to recompute derived from raw |
  | `derived-metric` | indefinite | n/a | Cheap to store; expensive to recompute at scale |
  | `audit-log` | 1 year | 5 years | Operational evidence |
  | `transient` | 30 days | none | Caches, temporary state |

**Per-core:**
- Each table picks a class (or declares custom values).

### 4.4 Algorithm Versioning

**Shared template:**
- Schema columns (§ 3.3) on every derived metric table.
- A **replay framework**: given `(algo_id, target_version, date_range)`, re-derive all matching rows.
- Versioning convention: semver, with major bumps signaling output-breaking changes.

**Per-core:**
- Algorithm registry (which `algo_id`s exist for this core).
- Version bump logic.
- Replay implementation per algo (the actual recompute function).

**Open decision (resolved in implementation plan):**
- **Replay model** — three options:
  - **Immediate** — every version bump triggers a re-derivation of all historical rows. Comparable but expensive.
  - **Lazy** — re-derive on read miss or on explicit operator trigger. Compromise; requires read-path version-awareness.
  - **Never** — history is frozen at the version that wrote it. Simplest; comparisons across versions are caller's problem.
  - **Default lean: lazy.**

### 4.5 Live vs. Historical State

**Shared template:**
- A **game state machine** with these canonical states:
  - `scheduled` — game exists in schedule, not yet started
  - `live` — game in progress (substates per-core: e.g. halftime, intermission, between-innings)
  - `final` — game completed; **immutable from this point forward** for derived metrics
  - `cancelled` — game removed from schedule
  - `postponed` — game date changed; row carries forward
- Immutability convention: once `final`, derived metric rows are append-only. Late-arriving corrections create a new versioned row, not an in-place update.
- A *correction* mechanism for the rare case of source-side score/stat fixes after `final`: emit a new derived row with the updated source data + bumped `computed_at`, retain prior row for audit.

**Per-core:**
- Concrete substates of `live` (NBA: in-progress / halftime; NHL: period 1/2/3/intermission; MLB: top/bottom of inning; golf: round 1/2/3/4 / playoff).
- The state-transition triggers (clock hits zero, period changes, etc.).
- Schedule-mutability rules per league (postponements, weather cancellations).

### 4.6 Source Failure Handling

**Shared template:**
- A **typed error taxonomy** all source clients raise:
  - `KeyMissing` — credential not configured
  - `KeyInvalid` — credential rejected
  - `RateLimited` — quota exceeded
  - `FeedDown` — source unreachable
  - `BadData` — feed responded but response failed validation
  - `Stale` — feed responded with data older than expected freshness
- **Retry/backoff machinery** with per-error-type policies (e.g. `RateLimited` → exponential backoff; `KeyMissing` → no retry, immediate fail).
- **App-facing failure semantics**: cores' app-facing endpoints surface failures as `503` with a structured `error` body (`{ type: "KeyMissing", message: "...", retryAfter?: number }`). No silent empty responses.

**Per-core:**
- Which feed and the mapping from feed-specific errors to the typed taxonomy.
- Acceptable cached-fallback policy (e.g. NHL: serve last-known schedule for up to 1 hour; basketball: serve last-known live state for up to 30 seconds during in-game polling).

**Anchoring example.** The Hockey-tab silent-failure surfaced during dev-setup test-run is exactly this gap. With the framework, that route would emit `503 + { type: "KeyMissing" }` and the Hockey UI could render an explicit "data source unavailable" state rather than indistinguishable empty.

## 5. Open Decisions for Implementation Plan

These are surfaced as named decisions; the implementation plan resolves them with concrete cost analysis:

| # | Decision | Default lean |
|---|---|---|
| 1 | Algorithm replay model | Lazy |
| 2 | Off-season deployment pattern (spin-down / heartbeat-only / always-on) | Heartbeat-only (cheap, alive for monitoring) |
| 3 | Sandboxed source-API keys for dev | Per-core decision based on cost |
| 4 | Migration tool (custom thin layer, sqitch, knex, raw SQL versioned) | Custom thin layer in `shared/` package |

## 6. Implications for Current Codebase

This spec implies these changes to today's repo (each becomes a step in the implementation plan):

| Today | After | Why |
|---|---|---|
| `app/lib/db.js::initDb()` does `CREATE TABLE IF NOT EXISTS` at startup | Versioned migration framework in `shared/` package; migrations applied explicitly | Schema evolution becomes safe and auditable |
| `team_mvix`, `player_swing_impact`, `alert_logs` rows have no version tags | Add `algo_id`, `algo_version`, `computed_at` columns | Algorithm versioning becomes possible (§ 3.3) |
| `app/api/hockey/poll/route.js` swallows source errors and returns `200 + games: []` | Adopt typed error taxonomy; surface `503 + { type, message }` | Aligns with § 4.6; UX becomes honest |
| `scripts/backfill.js`, `scripts/sr-nhl-cache*.js` are bespoke per-sport | Refactor as plugins to the shared backfill orchestrator | Aligns with § 4.2; new cores skip the bespoke step |
| Tables sit in `public` schema (one DB) | Move to schema-per-sport (`basketball`, `hockey`, `shared`) | Aligns with § 3.1 |
| Single repo, flat structure | Monorepo with `shared/`, `cores/<name>/`, `apps/<name>/` packages | Aligns with § 3.2 |

The implementation plan will sequence these — the migration-framework adoption gates the schema split, which gates the per-sport schema move, etc.

## 7. What This Enables

After this spec is implemented, onboarding a new core becomes:

1. Define the sport's event schema (per-core package)
2. Implement the source data client
3. Implement the algorithms
4. Declare retention values per table

Everything else — migrations, backup/restore, deployment, retry, failure semantics, monitoring, schedule sync, alert delivery — comes from the shared template.

## 8. Next Children

This spec resolves the lifecycle layer. The next children of the parent overview spec, in suggested order:

- **#2 Analytical segmentation** — tenure spans, aggregation queries, cross-cutting analytics layer
- **#3 Core-to-app contract** — REST/GraphQL/webhooks, polling cadence, auth between app and core
- **#7 Current codebase migration** — concrete refactor plan; depends on #1 and #2

#5 Source-API management and #6 Reference/asset data may merge into the implementation plan for this spec rather than warranting their own.
