# Swing Architecture Overview

**Status:** Approved design (parent spec)
**Date:** 2026-04-28
**Scope:** Conceptual frame for the Swing portfolio. Establishes vocabulary, layering, and the parameter taxonomy. Does not specify implementation; child specs do that.

## 1. Premise

The Swing product is evolving from a single sport-and-app bundle into a portfolio: a collection of audience-shaped applications powered by a shared substrate of sport-specific data backends.

This spec captures the architectural framing that organizes that evolution: the separation between data backends (**cores**) and user-facing **applications**, and the parameter schema that uniquely identifies each core instance. Subsequent specs (lifecycle, contracts, segmentation, etc.) refine specific layers — see § 7 for the index.

## 2. Architecture

Two layers, with a strict isolation boundary between them.

```
SWING
│
├── CORES (one per sport+league instance)
│   • Continuous data ingestion (schedules, rosters, games, play-by-play)
│   • Sport+league-specific algorithms and metrics
│   • Custom API per core for analysis, reporting, alerts
│   • Generates and emits in-game alerts/notifications
│   • Runs continuously
│   • NO user accounts — headless, audience-agnostic
│
└── APPLICATIONS (per audience, per scope)
    • Single-sport or multi-sport
    • Web + mobile (PWA SPA)
    • User accounts live HERE
    • Audiences:
        – Casual fan (free/paid)
        – Gambling (free/paid)
        – Coach / team staff (free/paid)
        – Play-by-play media / announcers (paid)
    • Each app consumes one or many cores via their APIs
```

**Inversion of control.** Cores never call apps. Apps poll/subscribe to cores. Notifications flow core → app via the contract defined in the core-to-app contract child spec.

**Per-instance isolation.** Each core is independently deployable, independently scalable, and may run on different infrastructure. Crossing a core boundary requires going through that core's public API.

**No shared data plane between core and app.** User identity, billing, and entitlement live entirely at the application layer.

## 3. Core Instance Pivot Parameters

A core instance is uniquely identified by:

| Field | Stored | Values |
|---|---|---|
| `sport-type` | yes | `football`, `basketball`, `baseball`, `hockey`, `soccer`, `golf`, ... |
| `sport-gender` | yes | `mens`, `womens`, `any` |
| `sport-level` | yes | `professional`, `collegiate`, `club`, `highschool` |
| `sport-sub-level` | yes | enumerable per level (below) |
| `sport-conference` | yes | league-defined or `''` |
| `sport-division` | yes | league-defined or `''` |
| `sport-league-name` | derived | display label only |

`sport-sub-level` enumerations:

| `sport-level` | Allowed `sport-sub-level` values |
|---|---|
| `professional` | `''` \| `AAA` \| `AA` \| `A` \| `Rookie` \| `AHL` \| `ECHL` \| `G-League` \| `UFL` \| `MLS-NextPro` \| ... |
| `collegiate` | `NCAA:D1` \| `NCAA:D2` \| `NCAA:D3` \| `NAIA` \| `NJCAA:D1` \| `NJCAA:D2` \| `NJCAA:D3` |
| `club` | `AAU` \| `NikeEYBL` \| `AdidasGauntlet` \| `UnderArmourUAA` \| ... (age group encoded separately in `sport-conference`, e.g. `U17`) |
| `highschool` | `6A` \| `5A` \| `4A` \| `3A` \| `2A` \| `1A` \| `Open` \| ... (per-state schemes vary) |

### Concrete instance examples

| Real entity | Encoded |
|---|---|
| LA Lakers | basketball / mens / professional / `''` / Western / Pacific |
| New York Liberty | basketball / womens / professional / `''` / Eastern / `''` |
| Stockton Kings (G League) | basketball / mens / professional / G-League / Western / `''` |
| Kentucky men's basketball | basketball / mens / collegiate / NCAA:D1 / SEC / `''` |
| Alabama football | football / mens / collegiate / NCAA:D1 / SEC / `''` |
| Reno Aces (AAA) | baseball / mens / professional / AAA / Pacific / `''` |
| PWHL Minnesota | hockey / womens / professional / `''` / `''` / `''` |
| Liberty Christian (TX HS, 6A) | basketball / mens / highschool / 6A / UIL-TX-District-19 / `''` |
| Mac Irvin Fire U17 | basketball / mens / club / NikeEYBL / U17 / `''` |
| PGA Tour event field | golf / mens / professional / `''` / `''` / `''` |

### Notes

- **One core = one instance configuration.** A `sport-type` × `sport-gender` × `sport-level` × `sport-sub-level` combination is the canonical identity. Two NBA teams live in the same core; an NBA team and a G League team do not (despite identical sport+gender+level), because their `sport-sub-level` differs.
- **`sport-league-name` is derived** from the other fields for display. It is not a key.
- **`sport-conference` is league-defined.** Different leagues have different conference vocabularies; the field stores whatever the league uses.
- **`sport-division` is optional** — populated where the league has both (NFL: AFC + South), empty where there is only one tier of grouping (NCAA SEC) or none at all (PWHL today).

## 4. Core Anatomy

Categorized by where the variation lies. Each category is named here at a paragraph's depth; detailed treatment lives in the child specs (§ 7).

### Common to all sports

Schedule and calendar, teams (with metadata: names, colors, abbreviations, IDs, logos), players and roster membership over time, games (entity with two teams + a date + a status), coaches and coaching staffs, venues, officials, standings, transactions.

### Specific to each sport

Game structure (innings vs. quarters vs. periods vs. sets), event vocabulary (touchdown vs. goal vs. 3pt vs. strikeout), stat categories, position taxonomy, field/court/rink zones, clock semantics, substitution and penalty rules.

### Specific to each league

Roster size limits, eligibility rules, scholarships, NIL rules, cap/salary structure (or absence), draft/recruiting, team count and grouping, playoff format (single-elim / best-of-N / tournament), broadcast partners, governance and officiating body.

### Instance template (the *shape* every instance has)

Data ingestion cadence and source client, schedule and roster sync, game state machine (scheduled → live → halftime → final → cancelled), live PBP feed processing, alert generation and delivery, app-facing API.

### Instance configuration (the *values* that differ per instance)

Concrete data source (ESPN, Sportradar, SR-NHL, ...) plus API key management plus rate-limit profile, sport+league-specific algorithms (MVIX/MRVI for NCAA D1 men's basketball; HDSR for NHL; future ones to come), alert types and thresholds (SIB / CW / SW today, future analogs), per-metric sign / weight / threshold semantics.

## 5. Commitments and Deferrals

| Decision | Status | Reopen if |
|---|---|---|
| US-only | **Deferred** — no `sport-region` field in v1 | International instance is greenlit |
| Minor pro leagues | **Included** — modeled via `sport-sub-level` for `professional` | — |
| Roster tier (varsity / JV / freshman) | **Out of core**; team-level metadata only | — |
| Audience / monetization / UX | **Out of core**; application-layer concern | — |
| HS state-association modeling | **TBD** — encoded inside `sport-conference` for now (e.g. `UIL-TX-District-19`); promote to top-level field if HS becomes a real product line | First HS-focused application is built |

## 6. Current Codebase Mapping

Today's `Swing` repo bundles core + app. The mapping below is **observation, not migration plan** — the migration is its own child spec (§ 7 #7).

**Core-shaped (data + ingestion + analytics):**
- `app/lib/sportradar*.js`, `app/lib/sr-nhl-possession.js`, `app/lib/team-mvix.js`
- `app/api/poll/route.js`, `app/api/hockey/poll/route.js`, `app/api/mvix/*`
- MVIX/MRVI computation, alert detection (SIB/CW/SW), HDSR momentum
- `team_mvix`, `player_swing_impact`, `alert_logs`, `alert_history`, `game_odds` tables
- `scripts/sr-nhl-cache*.js`, `scripts/backfill.js`, `scripts/analysis.js`

**Application-shaped (audience + UX):**
- `app/app/components/*` (Dashboard, SportsNav, hockey tab, etc.)
- `users`, `subscriptions` tables (auth + entitlement)
- `app/lib/auth.js`, `app/api/auth/*`, `app/api/subscriptions/*`

**Reference / shared:**
- ESPN league_id constants (`app/lib/config.js`)
- Schema initialization (`app/lib/db.js::initDb`)

## 7. Index of Child Specs

This parent doc establishes the conceptual frame. Each item below will be its own brainstorm → design → implementation plan cycle, ordered loosely:

| # | Title | Brief scope |
|---|---|---|
| 1 | Data lifecycle and environments | Dev/prod, backfill, retention, algorithm versioning, live vs. historical state, source failure handling |
| 2 | Analytical segmentation | Tenure spans, aggregation queries, cross-cutting analytics layer |
| 3 | Core-to-app contract | REST/GraphQL/webhooks, polling cadence, auth between app and core |
| 4 | Inter-app shared services | Identity/auth, billing, notifications (silo or share?) |
| 5 | Source-API management | league_id mapping, key rotation, rate limits, retry/backoff |
| 6 | Reference/asset data | Logos, colors, brand assets *(may merge into #5)* |
| 7 | Current codebase migration | Concrete refactor plan for today's Swing repo |

#7 likely waits until at least #1 and #2 are settled.
