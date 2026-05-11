# The Swing — Mobile App v1 Build Specification

**Status:** Active build spec
**Audience:** Claude Code executing autonomous build sessions
**Last updated:** 2026-05-11
**Repo location:** `apps/casual-fan-mobile/` (working name — confirm against final workspace conventions with @zhopen11 before first commit)
**Parent architecture:** `docs/superpowers/specs/2026-04-28-swing-architecture-overview.md`
**Sibling spec:** `docs/superpowers/specs/2026-04-28-data-lifecycle-environments-design.md`
**Foundation plan:** `docs/superpowers/plans/2026-04-28-foundation.md` (Phase 1 complete as of 2026-05-11)

---

## How to use this doc

Read this doc at the start of every session. It is the source of truth for the mobile build. Each section is self-contained; you do not need to read top-to-bottom every time, but the **Executive summary**, **Working assumptions and open items**, and the section for whatever you're building today are mandatory.

When a decision is not in this doc, surface it and ask the human (Zane) rather than inventing one. When a decision in this doc conflicts with what Zane says in chat, the chat wins — but ask Zane to update this doc before continuing so the change survives the session.

Treat the wireframes (the 12 reference renders captured in the original wireframe session) as the visual source of truth. When this doc and the wireframes disagree on visual specifics, ask.

---

## 1. Executive summary

### What The Swing is

The Swing is a real-time basketball momentum analytics platform. It measures who is *actually playing better* — not who is ahead — by computing a 0–100 momentum score per team from a sliding window of possession-level events, independent of score. When the score and the momentum disagree (one team leads on the scoreboard while the other dominates the run of play), the platform fires alerts:

- **⚡ Score Is Bluffing** — score leader ≠ momentum leader
- **👀 Comeback Watch** — trailing team leads momentum
- **⚠️ Swing Warning** — score even, momentum heavily one-sided

The platform's headline product claim is that these alerts are *predictive* — the algorithm catches what's coming minutes before the scoreboard does. Backtest accuracy: 86.1% on CBB, 81.6% on NBA, 84.3% combined across 912 games, graded against a 4:30 game-time window after each alert fires.

### What v1 of the mobile app is

A React Native (Expo) app for iOS and Android that brings the existing web dashboard (`the-swing.vercel.app`) to mobile, with **push notifications as the headline feature**. v1 is a small private beta distributed via TestFlight (iOS) and Google Play Internal Testing (Android) to friends and bettors — no public launch, no signup flow, no paywall.

v1 scope is full dashboard parity plus push, organized around 11 distinct screens (see § 6 Screen specs). v1 explicitly does *not* include: in-app purchases, account creation flows, real-time WebSocket/SSE (polling-only — see § 7), team logos (deferred to v2 — team-color avatars only), or any sport beyond basketball.

### The beta context

v1 is shipped to a closed list of testers who know Zane personally or got an invite code from one of them. The audience is forgiving but tasteful — they'll tolerate rough edges in obvious-beta features but will notice cheap visual design or broken push notifications. Polish the front door (Live tab, Game Detail, push notification delivery) and let secondary surfaces (empty states, settings) be honest about being beta.

The "BETA" badge appears on the Profile screen next to the user's name. The version footer (e.g. `v0.4.1 · BUILD 142`) is visible at the bottom of the Profile screen. Both are non-negotiable.

### Why this build is structured the way it is

The Swing platform is architecturally separated into **cores** (headless, per-sport data backends) and **applications** (audience-shaped clients with user accounts). The basketball core is what powers `the-swing.vercel.app` today. The casual fan application currently has one client (the Next.js web app at `apps/casual-fan/`); this spec adds a second sibling client (the mobile app at `apps/casual-fan-mobile/`) that consumes the same basketball core and shares the same application-layer concerns (user accounts, follows, notification preferences, entitlement).

In practical terms: **the mobile app is not a new product**. It's a second face for the casual fan application, talking to the same backend, sharing data with the web client at the application layer. Build decisions should honor that. When something feels like it could live in the mobile app *or* in a shared module that the web app could also use someday, lean toward shared.

---

## 2. Tech stack decisions

All of the following are locked unless this doc is updated.

### Platform and runtime

- **React Native via Expo** (managed workflow, SDK 52+, latest stable at session time)
- **TypeScript strict mode on** — no untyped code, no `any` without comment
- **Node 24 LTS** for tooling (matches the workspace root requirement set in the foundation plan)
- **iOS and Android from a single codebase** — no platform-specific forks unless absolutely necessary

### Navigation

- **`expo-router`** (file-based routing, current Expo recommendation over bare React Navigation)
- **Bottom tab navigator** for the main app shell with four tabs: Live / Alerts / Following / Profile
- **Onboarding is its own stack** that gates entry to the main app on first run

### State and data

- **TanStack Query (React Query) v5** for all server state. Every backend call goes through a `useQuery` or `useMutation` hook.
- **Zustand** for client state (follows, filters, onboarding completion flag, user preferences not yet synced)
- **AsyncStorage** for persistence (onboarding completion, cached user preferences, follow state cache for offline visibility)
- **No Redux, no Jotai, no MobX, no React Context for global state.** TanStack Query and Zustand cover everything.

### Real-time data strategy (v1)

Polling via TanStack Query's `refetchInterval`:

| Screen state | Interval | Notes |
|---|---|---|
| Live tab, focused | 10s | Pause when blurred (use `focusManager`) |
| Game Detail (live game), focused | 10s | Same |
| Alerts tab, focused | 30s | Alerts are less time-critical than scores |
| Profile, Following list, settings | No polling | Pull-to-refresh only |
| Game Detail (pregame or final) | No polling | Static at this state |
| Any screen, app backgrounded | All polling paused | Resume on foreground |

**Why polling and not WebSocket/SSE:** The platform-level core-to-app contract spec (child #3 of architecture overview) has not been written yet. Until it lands, the mobile app makes a working assumption that polling against existing REST endpoints is the right v1 approach. When that spec is written and pushes WebSocket/SSE as the canonical pattern, the mobile data layer can swap implementations behind the same hook interface without touching screen code. See § 7 for the abstraction that makes this swap cheap.

### Push notifications

- **Expo Push Notifications** (v1)
- Free, no separate vendor account needed, works on TestFlight and Play Internal Testing without additional setup
- Migration path to FCM/APNs direct (or OneSignal, or similar) is documented but explicitly deferred
- Push token registration happens on first launch after onboarding completes (not during onboarding itself — onboarding finishes, the user lands on the Live tab, then we request notification permission)

### Data fetching

- **`fetch`** (built-in, no `axios` needed)
- All backend calls wrapped in a single `apiClient` module (see § 7) so endpoint changes are one-file edits
- No GraphQL client; the backend is REST today and child spec #3 will determine the long-term shape

### UI primitives

- **`react-native`** core primitives only for layout (`View`, `Text`, `ScrollView`, `FlatList`, etc.)
- **No UI kit (no NativeBase, no Tamagui, no React Native Paper).** Visual identity is custom enough that a kit would fight us more than help. Build a small `components/ui/` set as needed.
- **`react-native-reanimated` v3** for any motion (momentum bar fills, alert ribbon pulse, modal slide-ups, sparkline draw-on animations)
- **`react-native-gesture-handler`** for any gesture-driven interactions (onboarding card swipe, modal dismissal swipe)
- **`react-native-svg`** for the time-series momentum chart on Game Detail and the sparklines on Pregame 411 MVIX cards
- **`lucide-react-native`** for icons (matches the icon style used in the wireframes)

### Typography and design tokens

- See § 4 (Design tokens) for the complete spec including font loading via `expo-font`

### Date and time

- **`date-fns`** (lightweight, tree-shakeable; preferred over `moment`)
- All timestamps from the backend are ISO 8601 strings in UTC; the mobile app formats them in the user's local timezone

### Linting and formatting

- **ESLint** with `@react-native/eslint-config` plus TypeScript strict rules
- **Prettier** for formatting; config inherits from the workspace root if present, otherwise defaults
- Pre-commit hooks not required for v1 (run lint manually before merging)

### Testing

- **No required test coverage for v1 beta.** Punt unit and integration tests. Set up a `__tests__/` directory structure and `jest` config so tests *can* be added later without rework, but do not write them as part of v1.
- Visual regression and e2e testing both deferred indefinitely.

---

## 3. Project structure

The mobile app lives at `apps/casual-fan-mobile/` in the monorepo. Inside that package, the layout is feature-based, not type-based:

```
apps/casual-fan-mobile/
├── app/                          # expo-router file-based routes
│   ├── (onboarding)/             # onboarding stack, shown once
│   │   ├── _layout.tsx
│   │   ├── 1-score-doesnt-tell.tsx
│   │   ├── 2-every-possession.tsx
│   │   └── 3-pick-what-matters.tsx
│   ├── (tabs)/                   # main tab navigator
│   │   ├── _layout.tsx           # bottom tab bar
│   │   ├── live.tsx              # Live tab
│   │   ├── alerts.tsx            # Alerts tab
│   │   ├── following.tsx         # Following tab (with Teams/Sports/Games sub-tabs)
│   │   └── profile.tsx           # Profile tab
│   ├── game/[id].tsx             # Game Detail screen
│   ├── alert/[id].tsx            # Alert Detail modal (presented modally)
│   ├── swinger/[gameId]/[playerId].tsx  # Swinger Detail modal
│   ├── explain/[metricId].tsx    # Explain modal
│   ├── _layout.tsx               # root layout (onboarding gate, providers)
│   └── +not-found.tsx
├── features/
│   ├── live/
│   │   ├── components/           # LiveGameCard, FilterPills, UpcomingSection
│   │   ├── hooks/                # useLiveGames, useFilteredGames
│   │   └── types.ts
│   ├── game-detail/
│   │   ├── components/           # PregameScoreboard, LiveScoreboard, MomentumChart, MVIXCard, MRVICard, SwingerRow, RecentForm
│   │   ├── hooks/                # useGameDetail, useGameMomentum, useGameSwingers
│   │   └── types.ts
│   ├── alerts/
│   │   ├── components/           # LiveAlertCard, FinishedAlertCard, AlertFilterPills
│   │   ├── hooks/                # useAlerts, useAlertDetail
│   │   └── types.ts
│   ├── following/
│   │   ├── components/           # TeamsView, SportsView, GamesView, FollowRow, NotificationTierPicker
│   │   ├── hooks/                # useFollows, useFollowMutations
│   │   └── types.ts
│   ├── profile/
│   │   ├── components/           # ProfileHeader, SnapshotCard, AccountSection, BetaSection
│   │   ├── hooks/                # useUserSnapshot
│   │   └── types.ts
│   ├── onboarding/
│   │   ├── components/           # OnboardingCard, ProgressDots, SportToggle, TeamChip
│   │   ├── hooks/                # useOnboardingState
│   │   └── types.ts
│   ├── explain/
│   │   ├── components/           # ExplainModal, ValueAnchorCard
│   │   ├── content/              # the 10 explain modal content entries (see § 8)
│   │   └── types.ts
│   └── swinger/
│       ├── components/           # SwingerHeader, PossessionStatsGrid, ContributionBars
│       ├── hooks/                # useSwingerDetail
│       └── types.ts
├── components/
│   ├── ui/                       # primitives: Button, Card, Pill, Badge, Avatar, ProgressBar
│   └── layout/                   # Screen, Stack, Row
├── lib/
│   ├── api/                      # the single API client module (see § 7)
│   │   ├── client.ts             # base fetcher, error taxonomy
│   │   ├── games.ts              # game-related endpoints
│   │   ├── alerts.ts             # alert-related endpoints
│   │   ├── follows.ts            # follow-related endpoints
│   │   ├── user.ts               # user/snapshot endpoints
│   │   ├── types.ts              # shared response types
│   │   └── index.ts
│   ├── push/                     # Expo Push Notifications setup
│   ├── store/                    # Zustand stores
│   ├── theme/                    # design tokens, typography, colors
│   ├── teams/                    # teams.json and lookup helpers (see § 5)
│   ├── templates/                # template library (see § 8)
│   └── utils/                    # date formatting, number formatting, etc.
├── assets/
│   ├── fonts/                    # Bebas Neue, DM Sans, DM Mono (TTF/OTF)
│   └── images/                   # app icon, splash, any static images
├── __tests__/                    # scaffold only, no required tests for v1
├── app.json                      # Expo config
├── eas.json                      # EAS Build config (for TestFlight/Play submissions)
├── babel.config.js
├── metro.config.js
├── tsconfig.json
├── package.json
└── README.md
```

### Naming conventions

- **Components:** PascalCase (`LiveGameCard.tsx`)
- **Hooks:** camelCase with `use` prefix (`useLiveGames.ts`)
- **Types:** PascalCase, in `types.ts` files per feature
- **Files in `app/`:** kebab-case (expo-router convention)
- **Constants:** SCREAMING_SNAKE_CASE in module scope; PascalCase for enum-like objects
- **No default exports** except for route files in `app/` (expo-router requires default exports there)

### Imports

- Use path aliases configured in `tsconfig.json`:
  - `@/features/*` → `features/*`
  - `@/components/*` → `components/*`
  - `@/lib/*` → `lib/*`
  - `@/assets/*` → `assets/*`
- Never use deep relative imports (`../../../`) — use the alias instead

---

## 4. Design tokens

All design tokens live in `lib/theme/`. Tokens are the single source of truth — nothing else in the codebase should contain raw color values, raw pixel sizes, or font names.

### Colors

```typescript
// lib/theme/colors.ts

export const colors = {
  // Brand
  navy: '#0B1929',          // primary background
  sky: '#5BB8F5',           // primary brand blue, CTAs, active states
  white: '#FFFFFF',
  offWhite: '#F4F6F8',

  // Surfaces (layered on navy)
  surface1: '#0F1F33',      // cards on navy
  surface2: '#152840',      // cards on cards (nested)
  surface3: '#1B304B',      // modal sheets

  // Borders and dividers
  border: '#1F3553',
  borderSubtle: '#162840',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A8B8CC',
  textTertiary: '#6F8299',
  textMuted: '#4A5A70',

  // Alert state (RESERVED for alert state only — never use for team identity)
  alertRed: '#C0392B',       // Bluffing
  alertOrange: '#E67E22',    // Comeback
  alertYellow: '#C8A800',    // Swing Warning

  // Semantic (HIT/PUSH/MISS, deltas, results)
  semGreen: '#27AE60',       // HIT, positive delta, win
  semRed: '#C0392B',         // MISS, negative delta, loss (intentionally same hex as alertRed)
  semYellow: '#C8A800',      // PUSH (intentionally same hex as alertYellow)

  // Misc
  liveDot: '#E74C3C',        // the pulsing red live indicator
  shadow: 'rgba(0, 0, 0, 0.4)',
} as const;
```

**Critical rule:** Alert colors (`alertRed`, `alertOrange`, `alertYellow`) are reserved for *alert state* — left card borders on Live and Alerts tab cards, alert badge backgrounds, the pulsing dot, alert ribbons on Game Detail. They are *never* used for team identity. Team identity uses team-specific colors from `teams.json` (see § 5).

The semantic colors (`semGreen`, `semRed`, `semYellow`) share hex values with alert colors but are conceptually different — they represent *outcomes* (HIT/PUSH/MISS, win/loss, positive/negative delta) rather than alert state. Keep them as separate tokens in code even when they happen to map to the same hex; this keeps future tweaks scoped.

### Typography

Three families, loaded via `expo-font`:

- **Bebas Neue** — logo, headlines, screen titles ("SWING", "PICK WHAT MATTERS TO YOU")
- **DM Sans** — body copy, button labels, descriptions
- **DM Mono** — numerical values, data labels, abbreviations ("BOS", "78", "+18", "62 ↑ 3"), section labels like "MOMENTUM", "MVIX", "TOP SWINGERS · L10"

```typescript
// lib/theme/typography.ts

export const fonts = {
  bebas: 'BebasNeue-Regular',
  sans: 'DMSans-Regular',
  sansMedium: 'DMSans-Medium',
  sansBold: 'DMSans-Bold',
  mono: 'DMMono-Regular',
  monoItalic: 'DMMono-Italic',     // CRITICAL — see below
  monoMedium: 'DMMono-Medium',
} as const;

export const type = {
  // Headlines
  hero: { fontFamily: fonts.bebas, fontSize: 48, lineHeight: 52, letterSpacing: 0.5 },
  h1: { fontFamily: fonts.bebas, fontSize: 32, lineHeight: 36, letterSpacing: 0.5 },
  h2: { fontFamily: fonts.bebas, fontSize: 24, lineHeight: 28, letterSpacing: 0.5 },

  // Screen titles (the "SWING / LIVE", "SWING / ALERTS" pattern)
  screenTitle: { fontFamily: fonts.bebas, fontSize: 28, lineHeight: 32, letterSpacing: 1 },
  screenSubtitle: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 16, letterSpacing: 2, textTransform: 'uppercase' as const },

  // Body
  bodyLg: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  bodySm: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },

  // Data labels (section headers like "MOMENTUM", "MVIX")
  label: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 14, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  labelSm: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 12, letterSpacing: 1.5, textTransform: 'uppercase' as const },

  // Numerical values
  number: { fontFamily: fonts.mono, fontSize: 16, lineHeight: 20 },
  numberLg: { fontFamily: fonts.mono, fontSize: 24, lineHeight: 28 },
  numberHuge: { fontFamily: fonts.mono, fontSize: 56, lineHeight: 60 }, // big scoreboard scores
  numberMomentum: { fontFamily: fonts.monoItalic, fontSize: 16, lineHeight: 20 }, // CRITICAL — see below
  numberMomentumLg: { fontFamily: fonts.monoItalic, fontSize: 22, lineHeight: 26 },
} as const;
```

### THE ITALIC DM MONO CONVENTION (CRITICAL)

**Every momentum numerical value displayed in the app uses italic DM Mono.** This is a load-bearing visual convention. Examples from the wireframes:

- Pregame 411 "AVG MOMENTUM" right-side numbers (`62 ↑ 3`, `49 ↓ 5`) — italic
- Live tab game cards' momentum bar end-labels (the `38` and `72` next to BOS/MIA) — italic
- Game Detail scoreboard's small momentum numbers next to scores (`38 78`, `73 72`) — italic
- Pregame 411 Top Swingers contribution numbers (`+14`, `+11`) — italic
- Alert cards' momentum percentages and swinger contributions — italic
- Game Detail Swingers leaderboard contribution numbers — italic

Non-momentum numerical values use regular (non-italic) DM Mono:

- Scoreboard scores themselves (`78`, `73`) — non-italic, huge
- Spreads (`-5.5`, `+4.5`), totals (`O/U 142.5`) — non-italic
- MVIX numerical values (`23`, `41`, `31`, `42`) — non-italic
- MRVI numerical values (`−4`, `+8`) — non-italic
- Game clock (`Q3 · 7:42`) — non-italic
- Counts and timestamps (`84` followed alerts, `2m ago`) — non-italic

**Rule:** if the number represents *momentum* (a 0–100 momentum score, a swinger contribution, a momentum percentage), use italic. If it represents anything else (score, time, count, MVIX, MRVI, spread), use non-italic.

When in doubt, look at the wireframes. If still in doubt, ask.

### Spacing

8-point grid:

```typescript
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;
```

### Radii

```typescript
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;
```

### Shadows / elevation

Most of the UI is flat with surface-color layering for depth (`navy` → `surface1` → `surface2`). Use shadows sparingly:

```typescript
export const shadow = {
  card: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  modal: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 12 },
} as const;
```

### Brand voice (for any generated copy)

- Confident, "the score is lying" energy
- Concrete over abstract — use specific numbers ("72% of the live momentum") not vague claims ("dominating")
- Audience is 18–40 male sports fans and bettors
- Never use exclamation marks for emphasis (the data should provide the punch)
- Never use emojis except the three alert glyphs (⚡ 👀 ⚠️) and only in the contexts where they're already established

---

## 5. Team color system

### The teams.json file

Lives at `lib/teams/teams.json`. Schema:

```typescript
type Team = {
  abbr: string;              // 'BOS', 'KAN', 'UNC', 'MARQ'
  name: string;              // 'Celtics', 'Jayhawks', 'Tar Heels'
  fullName: string;          // 'Boston Celtics', 'Kansas Jayhawks'
  league: 'NBA' | 'CBB';
  primary: string;           // hex, the team's actual brand color
  display: string;           // hex, contrast-adjusted for navy background (WCAG AA against navy)
};
```

Bootstrap with a starter list of the top ~30 NBA teams and top ~30 CBB programs. Code may extend this file as needed during the build (e.g. when adding test data) but the *schema* is locked.

### Display color overrides

Some teams have primary colors that fail WCAG AA contrast against the navy background. These need a lighter `display` color while preserving brand identity:

| Team | Primary | Display |
|---|---|---|
| Duke | #001A57 (deep navy) | lighter blue |
| Villanova | #00205B (navy) | lighter blue |
| Penn State | #041E42 (navy) | lighter blue |
| Georgetown | #041E42 (navy) | lighter blue |
| Houston (NBA + CBB) | very dark red | brighter red |

(The exact `display` hex values should be chosen by the implementer to pass WCAG AA against `#0B1929` while staying recognizably close to the primary. Document the chosen value in `teams.json`.)

For teams whose primary already passes contrast (Lakers purple, Heat orange, Celtics green, etc.), `display` equals `primary`.

### Lookup helpers

```typescript
// lib/teams/lookup.ts
export function getTeam(abbr: string): Team | null;
export function getTeamDisplayColor(abbr: string): string;  // returns display, falls back to sky if unknown
export function getTeamAvatar(abbr: string): { color: string; label: string };  // for the circular avatar (color + abbreviation text)
```

### Critical rule

The mobile app **never uses alert colors for team identity** and **never uses team colors for alert state**. The two color systems are separate concerns and must stay separate. A red team avatar (e.g. Houston) appearing next to a red alert ribbon is fine *because they convey different information* — but never re-use one for the other in code.

### Logos: deferred to v2

v1 ships with circular avatars only (team-color background + team abbreviation in white DM Mono). Do not attempt to source logo images. Logo licensing is a v2 concern.

---

## 6. Screen-by-screen specs

Each screen entry below covers: layout structure, components used, data dependencies (which API endpoints, which hooks), navigation in and out, error/empty states, polish notes. Refer to the wireframes for exact visual layout — this section captures the *logic* of each screen.

### 6.1 Live tab (`app/(tabs)/live.tsx`)

The front door. First screen users see after onboarding.

**Layout:**
- Sticky header: "SWING" wordmark + "LIVE" subtitle, search icon and notification bell on the right
- Horizontal filter pills below header: All / NBA / CBB / Following
- Section: "LIVE NOW · N GAMES" with a pulsing red dot
- Scrollable list of `LiveGameCard` components, one per live game
- Section: "UPCOMING" with `UpcomingGameCard` components

**LiveGameCard structure:**
- Left edge: 4px-wide colored border. Color is the alert color if the game has an active alert (`alertRed` for Bluffing, `alertOrange` for Comeback, `alertYellow` for Swing Warning); otherwise no border / transparent.
- Top row: League pill (`NBA` / `CBB`), period and clock (`Q3 · 7:42`), alert badge on right if applicable (e.g. "⚡ BLUFFING" in alert red)
- Two team rows, each with: team abbreviation in team display color (DM Mono), team name in white (DM Sans), momentum bar fill in team display color, momentum number (italic DM Mono) and score (huge DM Mono)
- Bottom: one-line insight in white DM Sans (e.g. "Miami trails by 5 but owns 72% of the live momentum.")

**Data:**
- `useLiveGames()` hook → `GET /api/live` from the basketball core
- Polls every 10s while focused, pauses on blur
- Filter state lives in a Zustand store; applies client-side to the fetched list

**Navigation:**
- Tap a game card → push `app/game/[id]` (Game Detail)
- Tap search icon → present search modal (v1: punt — render a "Coming soon" toast; spec the modal but don't build it)
- Tap notification bell → push `app/(tabs)/alerts`

**Empty states:**
- No live games: large centered "No games live right now." in `textSecondary`, with "Check back at tipoff" in smaller `textTertiary`. Show the upcoming section underneath if there are upcoming games.
- Network error: "Couldn't reach the data feed. Pull to refresh." Use `apiClient` error type to differentiate (see § 7).
- API returned typed 503: "Data source unavailable." with the typed error message rendered smaller below.

**Polish:**
- Pulsing live dot uses `useSharedValue` + `withRepeat` from Reanimated, 1s pulse
- Momentum bars animate fill changes (don't just snap to new values)
- Pull to refresh triggers `refetch()` from TanStack Query

### 6.2 Game Detail — pregame state (`app/game/[id].tsx` when `gameState === 'scheduled'`)

**Layout:**
- Back chevron, league + "PREGAME" subtitle, favorite star + bell + share icons in header
- Scoreboard row: away team abbr + name + FAV badge if favored, "TIPOFF IN 2h 19m" with O/U center, home team abbr + name with spread. Use team display colors for abbreviations and DM Mono italic for any momentum-related numbers (there shouldn't be any here — momentum unlocks at tipoff).
- Pregame 411 card (the rich pregame insight block):
  - "PREGAME 411 · LAST 10 GAMES" header
  - **AVG MOMENTUM** section: two team rows with horizontal bar fills (team display color) and momentum values on the right (italic DM Mono) with deltas (`↑ 3` green, `↓ 5` red — direction-as-quality: up is good, down is bad)
  - **MVIX** section: two cards side-by-side, one per team, each with: team abbr (display color), big MVIX number (non-italic DM Mono), small delta (`↓ 4` green, `↑ 8` red — direction-as-quality: down is good for MVIX because steady = good), small sparkline chart in team display color, footer label "TRENDING STEADY" / "TRENDING CHAOTIC" in semantic color
  - Insight paragraph: a generated one-liner from the template library (see § 8) describing the matchup, with key phrases color-coded (team display colors for team names, alert colors for momentum-related terms when relevant)
  - **TOP SWINGERS · L10** section: two cards side-by-side, one per team, each with the top 3 swingers (rank + name + position + contribution in italic DM Mono in team display color)
  - **RECENT FORM** section: two team rows, each showing the last 5 games as W/L badges (green/red) with small dots indicating ATS results, plus a right-side summary like "4-1 / 3-2 ATS"
- Below Pregame 411: a footer card with clock icon and "LIVE MOMENTUM UNLOCKS AT TIPOFF" in `textTertiary`

**Data:**
- `useGameDetail(id)` → `GET /api/games/:id`
- `useGamePregameStats(id)` → `GET /api/games/:id/pregame` (pulls from the nightly `team_pregame_stats` rollup; see § 11)
- No polling on pregame games — refetch on pull-to-refresh and on screen focus only

**Navigation:**
- Back chevron → pop
- Tap favorite star → toggle follow on both teams (or just the home team — confirm with Zane)
- Tap bell → present notification tier picker modal
- Tap share → native share sheet with a generated share-card URL
- Tap any info circle (the ⓘ icon next to "AVG MOMENTUM", "MVIX") → present Explain modal for that metric

**Empty states:**
- Pregame stats unavailable (rollup hasn't run for one of these teams yet): hide the relevant section, show "Pregame data not available for this matchup" in its place

### 6.3 Game Detail — live state (`app/game/[id].tsx` when `gameState === 'live'`)

**Layout:**
- Header: same as pregame but with "Q3 · 7:42" in place of "PREGAME"
- Top alert ribbon if an alert is active: pulsing dot, "SCORE IS BLUFFING" in alert red DM Mono, "FIRED 2:18 AGO" right-aligned
- Scoreboard: away team abbr + name + FAV badge, italic DM Mono momentum number, huge DM Mono score, "SPREAD" + "O/U" center column, home team abbr + name + spread + huge score + italic DM Mono momentum number. Background tinted to alert color at ~10% opacity when an alert is active.
- Below scoreboard: the alert one-liner from the template library
- **MOMENTUM** section: two team rows with horizontal bar fills (team display color) and momentum values right (italic DM Mono), with a small "LIVE" indicator and ⓘ icon
- **CHART** section: time-series momentum chart (use `react-native-svg`)
  - X-axis: game time (Q1 through current)
  - Y-axis: 0–100 momentum
  - Two lines, one per team, in team display colors
  - Vertical dashed marker showing when each alert fired, with a small "⚡ ALERT" pill at the top of the marker
  - Tab bar at top right of chart: FULL / Q3 / 5MIN
- **MVIX** and **MRVI** side-by-side cards (similar to pregame but with live values)
- **SWINGERS · LAST 12 POSS** leaderboard: rows of rank circle (team display color background) + player name + position, with contribution value (italic DM Mono in team display color) on the right
- "VIEW ALL SWINGERS →" link at the bottom of the leaderboard

**Data:**
- `useGameDetail(id)` → `GET /api/games/:id`
- `useGameMomentum(id)` → `GET /api/games/:id/momentum` (time-series data)
- `useGameSwingers(id)` → `GET /api/games/:id/swingers`
- `useGameAlerts(id)` → `GET /api/games/:id/alerts` (active and recent alerts for this game)
- Polls every 10s while focused if `gameState === 'live'`

**Navigation:**
- Tap alert ribbon → present `app/alert/[id]` (Alert Detail modal) for the most recent active alert
- Tap swinger row → present `app/swinger/[gameId]/[playerId]` (Swinger Detail modal)
- Tap "VIEW ALL SWINGERS" → push a full swingers list screen (v1: render a basic full-list screen — same row component, just unlimited)
- Tap any ⓘ → present Explain modal for that metric
- Tap chart range tab (FULL/Q3/5MIN) → filter the chart data client-side

**Empty states:**
- Game just started, momentum still warming up: chart shows "Momentum stabilizes after ~5 possessions" instead of an empty plot
- Game ended (state transitioned to `final` while user was on screen): scoreboard locks, polling stops, momentum chart shows full game, "FINAL" label replaces game clock

### 6.4 Alerts tab (`app/(tabs)/alerts.tsx`)

**Layout:**
- Header: "SWING" / "ALERTS", filter icon + settings gear on right
- Horizontal filter pills: All N / ⚡ Bluffing N / 👀 Comeback N / ⚠️ Swing Warning N (counts in parens, color-coded)
- Sport sub-filter pills below: NBA / CBB / + Sport
- Section: "LIVE · N" — live alerts (cards with full color treatment, left border in alert color, alert badge at top, score row, one-liner insight)
- Section: "EARLIER TODAY · N" — finished alerts with HIT/PUSH/MISS badges
  - Each card shows: alert type badge, sport pill, HIT/PUSH/MISS pill (green/yellow/red), team abbreviations with final momentum and final score in DM Mono, narrative one-liner ("SAC outscored GSW 24-8 in the next 4:30. Comeback called clean.")

**Data:**
- `useAlerts({ sport, type, date })` → `GET /api/alerts?type=&date=&sport=`
- Polls every 30s while focused
- Filter state in Zustand, applied as query params

**Navigation:**
- Tap a live alert card → present Alert Detail modal
- Tap a finished alert card → push Game Detail for that game (showing the final state with the alert marker on the chart)

**Empty states:**
- No alerts today: "No alerts fired today. The score and the run of play agree — for now." in `textSecondary`
- Filtered to a type with no matches: "No [Bluffing/Comeback/Swing Warning] alerts today."

### 6.5 Following tab — Teams view (`app/(tabs)/following.tsx`, default segment)

**Layout:**
- Header: "SWING" / "FOLLOWING", search icon + add icon on right
- Segmented control: Teams N / Sports N / Games N
- Below segmented control, the active view:

**Teams view content:**
- Grouped by sport (NBA, CBB), with section headers showing count and "SORT: RECENT" link
- Each row: circular team avatar (display color + abbreviation in white DM Mono), team name + status line ("LIVE · ⚡ BLUFFING" or "LIVE · 78 Q3 · 7:42" or "vs LAC · TOMORROW 7:30 PM" or "NO GAME TODAY · NEXT THU"), notification tier indicator on right (ALL / ALERTS / PERIOD / OFF — each with its own icon and color), chevron

**Notification tier indicators:**
- **ALL** — text label in sky blue (no icon)
- **ALERTS** — bolt icon (⚡) + "ALERTS" in alert red
- **PERIOD** — flag icon + "PERIOD" in alert yellow
- **OFF** — struck-through bell icon + "OFF" in `textTertiary`

**Data:**
- `useFollows({ kind: 'team' })` → `GET /api/follows?kind=team`
- For each followed team, the row also needs the team's current game state — bulk-fetched via a separate hook to keep the screen fast

**Navigation:**
- Tap row → push Game Detail (if team has a game today/now) or push a team detail screen (v1: punt team detail — just go to next game or upcoming game)
- Tap chevron / row long-press → present notification tier picker modal

### 6.6 Following tab — Sports view

Similar structure to Teams but at the sport level. Each sport has its own notification tier (ALL / ALERTS / PERIOD / OFF). Smaller list (just NBA and CBB in v1).

### 6.7 Following tab — Games view (per-game follows)

**Layout:**
- Header info card: "Track specific games without following the teams. Games auto-remove 2 hours after final whistle."
- Section: "LIVE · N" — live games being followed individually
- Section: "UPCOMING · N" — upcoming games being followed
- Section: "RECENTLY FINISHED · N" — recently finished games, each with HIT/PUSH/MISS receipt summary and "Auto-removes in 1h 13m" timer

**Data:**
- `useFollows({ kind: 'game' })` → `GET /api/follows?kind=game`
- The auto-expire 2h timer is computed client-side from `gameEndedAt` + 2h; the server-side cleanup is the source of truth but the client should hide expired entries proactively

**Navigation:**
- Tap a game card → push Game Detail
- Tap the X on a recently-finished card → optimistic unfollow

**Polish:**
- Per-game follow defaults to ALERTS-ONLY notification tier (can be changed via tier picker)

### 6.8 Profile tab (`app/(tabs)/profile.tsx`)

**Layout:**
- Header: "SWING" / "PROFILE", settings gear on right
- User card: large circular avatar (initials), name + BETA badge, email, "MEMBER SINCE MAY 2026", chevron
- "MY SWING SNAPSHOT" section header with ⓘ icon
- Three side-by-side stat cards:
  - **FOLLOWED ALERTS** — count + "LAST 30 DAYS" caption
  - **HIT RATE** — percentage with delta (↑3 in green) + "VS 30 DAYS AGO" caption
  - **BEST CALL** — value (e.g. "+24") + "SAC OVER GSW" caption
- **ACCOUNT** section: rows for Notifications, Appearance, Odds & betting display, Privacy & data
- **BETA** section: rows for Send feedback, Report a bug (with app version + build), Invite a friend (with "3 OF 5 INVITES USED")
- **ABOUT** section: rows for How The Swing works, Follow @TheMoSwing, Terms & privacy, Sign out (in alert red)
- Footer: SWING wordmark watermark, "v0.4.1 · BUILD 142", "© 2026 THE SWING"

**Data:**
- `useUserSnapshot()` → `GET /api/user/me/snapshot` (Followed Alerts, Hit Rate, Best Call, all from the nightly `user_snapshots` rollup; see § 11)
- `useUserProfile()` → `GET /api/user/me`

**Navigation:**
- Most rows are settings sub-screens — for v1, render placeholder screens that just say "Coming soon" except for: Notifications (which is functional — see § 9), Send feedback (opens mailto: link to a feedback@theswing.app address — confirm exact address with Zane), Report a bug (also mailto:), Invite a friend (presents a share sheet with a placeholder invite link — v1 doesn't need real invite codes, just the share UX), How The Swing works (push a static info screen), Follow @TheMoSwing (open Twitter/X in browser), Sign out (clears AsyncStorage and routes back to onboarding)

### 6.9 Onboarding (`app/(onboarding)/`)

Three swipeable cards, each with a progress dot indicator and Skip button at the top-right.

**Card 1 — "THE SCORE DOESN'T TELL THE WHOLE STORY"**
- Mock scoreboard: BOS 78 / MIA 73 in plain DM Mono
- "THE SWING SAYS" with two momentum bars: BOS 38 (sky blue) / MIA 72 (alert red, italic DM Mono numbers)
- Hero headline in Bebas Neue
- Subhead paragraph
- Continue button (full-width, sky blue)

**Card 2 — "WE WATCH EVERY POSSESSION"**
- Hero headline
- Subhead paragraph
- Three alert-tier explainer cards (one per alert type), each with the alert glyph, alert type name in alert color, and a one-line explanation. Use the alert colors for the left borders.
- Continue button

**Card 3 — "PICK WHAT MATTERS TO YOU"**
- Hero headline
- Subhead paragraph
- **SPORTS** section: two large cards with basketball icons, NBA and CBB. Both pre-checked. Tap to toggle.
- **POPULAR TEAMS** section: grid of team chips (avatar + name), tappable to toggle. Show top ~8 popular teams (mix of NBA and CBB). "Search" link in top right for finding others.
- Helper text below: "You can change all of this anytime in Following."
- "Open The Swing" button (full-width, sky blue)

**Data:**
- All state is local until the user taps "Open The Swing" — at which point:
  1. Save onboarding state to AsyncStorage (`hasCompletedOnboarding = true`)
  2. POST initial follows to `/api/follows/bulk` (sports + teams selected)
  3. Request push notification permission
  4. Navigate to `app/(tabs)/live`

**Skip behavior:**
- Card 1 and Card 2 "Skip" jumps straight to Card 3 (not out of onboarding entirely — Card 3's selections are too important to skip)
- Card 3 has no skip; the only forward path is "Open The Swing"

**Gating:**
- The root layout (`app/_layout.tsx`) reads `hasCompletedOnboarding` from AsyncStorage at boot. If false, route to `(onboarding)`. If true, route to `(tabs)`.
- For dev/QA, expose a hidden "Reset onboarding" toggle in Profile (only show in `__DEV__` builds, not in production)

### 6.10 Alert Detail modal (`app/alert/[id].tsx`)

Presented modally (slides up from bottom). Contains:

- Top: alert type header (pulsing dot + "⚡ SCORE IS BLUFFING" in alert red), share icon + close icon
- Game context bar: "NBA · Q3 · 7:42" left, "2m ago / Fired Q3 · 9:58" right (DUAL TIMESTAMP — see below)
- Scoreboard row: team abbrs in team display colors, momentum numbers in italic DM Mono, scores in huge DM Mono, spread between teams (e.g. "SPREAD / BOS −5.5")
- "WHAT'S HAPPENING" section: a generated one-liner with key data points color-coded (the 72% percentage in alert orange)
- Reasoning quote-block: a paragraph with possession-level data ("Over the last 12 possessions, Miami has scored on 8, generated 3 stops, and forced 2 turnovers...") with numbers color-coded by team
- "DRIVING THE MOMENTUM" section: top 2 swingers as rows (rank circle in alert color, player name + team + position, contribution in italic DM Mono in alert color)
- CTA row: "View game" (outlined sky blue button) + "Open dashboard" (filled sky blue button)

**THE DUAL TIMESTAMP PATTERN (critical):**
Every alert reference in the app shows both:
- **Real-time elapsed** ("2m ago", "11m ago", "3h ago") — when the alert fired in wall-clock time
- **Game clock when fired** ("Q3 · 9:58", "2H · 16:33") — the in-game time at the moment of firing

These appear together in alert cards (Alerts tab) and on the Alert Detail modal. They serve different purposes: elapsed time tells the user "is this still relevant?", game clock tells the user "where in the game did this happen?" — both matter and neither replaces the other.

**Data:**
- `useAlertDetail(id)` → `GET /api/alerts/:id`

**Navigation:**
- Swipe down or tap close → dismiss
- Tap "View game" → push Game Detail (replaces modal)
- Tap "Open dashboard" → dismiss modal and navigate to Live tab (also a reasonable interpretation: open a web view of the full dashboard — confirm with Zane; default for v1 is "dismiss and go to Live")
- Tap a swinger row → push Swinger Detail modal on top

### 6.11 Swinger Detail modal (`app/swinger/[gameId]/[playerId].tsx`)

Presented modally. Contains:

- Header: "SWINGER · MIA vs BOS" subtitle, close icon
- Player header: large team-color circular avatar with player initials, full name in white Bebas Neue, position + team abbr + jersey number in `textSecondary` DM Sans, big SWING SCORE value in italic DM Mono in team display color
- "LAST 12 POSSESSIONS" section: 4-stat grid (Scored On / Assists / Stops / Turnovers), each with: big value in DM Mono (italic if it's a momentum-coded value, see § 4) in team display color, label in `textTertiary` DM Mono small caps, descriptor below
- "CONTRIBUTION BREAKDOWN" section: three horizontal bars (SCORING / PLAYMAKE / DEFENSE) each in team display color, with value right (italic DM Mono `+12`, `+4`, `+2`)
- Narrative paragraph generated from the template library (player has been [team]'s [role] in this stretch...)
- "View [Player]'s full game" CTA button (full-width sky blue)

**Data:**
- `useSwingerDetail(gameId, playerId)` → `GET /api/games/:gameId/swingers/:playerId`

**Notes on data limitations:**
The "Last 12 Possessions" stat grid (Scored On / Assists / Stops / Turnovers) requires possession-level player attribution that ESPN's public API does not reliably provide at this granularity. For v1 with ESPN as the data source:
- Render whatever subset is reliably derivable from ESPN play-by-play (typically: scoring contribution, broad assist/turnover counts)
- For unavailable values, render an em-dash (`—`) instead of a number, and the descriptor text shows "Not available" in `textTertiary`
- The type for `SwingerDetail` should mark these fields as optional and the component should handle their absence gracefully
- When Sportradar migration eventually happens, these fields become populated automatically without mobile rework

### 6.12 Explain modal (`app/explain/[metricId].tsx`)

Presented modally. Triggered from any ⓘ icon throughout the app. Contains:

- Header: ⓘ icon + "WHAT'S [METRIC]" label in sky blue, close icon
- Hero headline in Bebas Neue (the metric's full name, e.g. "MOMENTUM VOLATILITY INDEX" with "VOLATILITY INDEX" highlighted in sky blue)
- Pronunciation aid in DM Mono small caps (e.g. `MVIX · PRONOUNCED "EM-VIX"`)
- Plain-English definition in DM Sans, with key phrases highlighted in sky blue
- Three value-anchor cards (Low / Mid / High), each with: big example value in DM Mono in semantic color (green/yellow/red), label, one-line description. Use the same color scheme as the metric uses in the app (e.g. MVIX low = green = steady, MVIX high = red = chaotic).
- "Why it matters" callout (boxed, sky blue accent)
- Two CTAs at bottom: "Learn more" (outlined) + "Got it" (filled sky blue)

**The 10 explain modal entries:**
1. Momentum
2. MVIX (Momentum Volatility Index)
3. MRVI (Momentum Relative Volatility Index)
4. Swingers
5. Score Is Bluffing alert
6. Comeback Watch alert
7. Swing Warning alert
8. Hit Rate
9. Push notifications
10. Average Momentum

Content for each lives in `features/explain/content/` as TypeScript objects matching a schema. See § 8.

**The Explain modal tap target pattern:**
EVERY metric label throughout the app has an associated ⓘ icon next to it. Tapping it presents the Explain modal for that metric. The tap target is the whole label + icon group (not just the icon). Examples of where ⓘ icons appear:
- "AVG MOMENTUM" header on Pregame 411
- "MVIX" header on both Pregame 411 and Game Detail
- "MRVI" header on Game Detail
- "MOMENTUM" header on Game Detail
- "MY SWING SNAPSHOT" header on Profile
- "Notifications" row on Profile (for the push notifications explain)

If a metric label appears without an ⓘ icon anywhere in the codebase, that's a bug — file it.

---

## 7. Data layer architecture

### The single API client module

All backend calls go through `lib/api/`. Screens and feature hooks never call `fetch` directly. This is the abstraction that makes the eventual core-to-app contract migration cheap.

**Structure:**

```typescript
// lib/api/client.ts

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://the-swing.vercel.app';

export type ApiErrorType =
  | 'KeyMissing'
  | 'KeyInvalid'
  | 'RateLimited'
  | 'FeedDown'
  | 'BadData'
  | 'Stale'
  | 'NetworkError'   // mobile-side only — couldn't reach the server at all
  | 'Unknown';

export class ApiError extends Error {
  type: ApiErrorType;
  status?: number;
  retryAfter?: number;
  constructor(type: ApiErrorType, message: string, status?: number, retryAfter?: number) { ... }
}

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  // 1. Build URL from BASE_URL + path
  // 2. Add default headers (Accept: application/json)
  // 3. Fire fetch with a 10s timeout
  // 4. On network failure → throw ApiError('NetworkError', ...)
  // 5. On 503 with structured error body → parse and throw ApiError(body.type, body.message, 503, body.retryAfter)
  // 6. On 5xx without structured body → throw ApiError('Unknown', ...)
  // 7. On 4xx → throw ApiError('Unknown', ..., status)
  // 8. On 2xx → parse JSON and return as T
}
```

**Why this matters:**

The architecture spec § 4.6 defines a typed source-failure taxonomy that the basketball core will eventually emit as `503 + { type, message, retryAfter? }`. Today the core does *not* emit these (it returns empty 200s on failure — the anchoring example in the architecture spec is the Hockey-tab silent-failure). The mobile app is built **expecting the future contract** so that when the backend catches up (planned in foundation plan's Plan E), the mobile UI is already wired to display the right error states.

In the interim, the mobile app treats empty 200s as a generic "data unavailable" state — same UX as the future `503 + FeedDown` will produce, just less specific.

### Endpoint modules

```typescript
// lib/api/games.ts
export function getLiveGames() { return apiFetch<LiveGamesResponse>('/api/live'); }
export function getGame(id: string) { return apiFetch<GameDetail>(`/api/games/${id}`); }
export function getGameMomentum(id: string) { return apiFetch<MomentumTimeline>(`/api/games/${id}/momentum`); }
export function getGameSwingers(id: string) { return apiFetch<SwingerList>(`/api/games/${id}/swingers`); }
export function getGameAlerts(id: string) { return apiFetch<Alert[]>(`/api/games/${id}/alerts`); }
export function getSwinger(gameId: string, playerId: string) { return apiFetch<SwingerDetail>(`/api/games/${gameId}/swingers/${playerId}`); }
export function getPregameStats(id: string) { return apiFetch<PregameStats>(`/api/games/${id}/pregame`); }
```

Similar modules for `alerts.ts`, `follows.ts`, `user.ts`.

### Response types

Every type carries the architecture's optional algorithm-versioning fields:

```typescript
// lib/api/types.ts
type AlgorithmMetadata = {
  algoId?: string;       // 'momentum-team', 'mvix-team', 'mrvi-player', etc.
  algoVersion?: string;  // semver
  computedAt?: string;   // ISO 8601
};

export type TeamMomentum = AlgorithmMetadata & {
  team: TeamRef;
  momentum: number;       // 0-100
  mvix?: number;
  mrvi?: number;
};

export type GameDetail = AlgorithmMetadata & {
  id: string;
  league: 'NBA' | 'CBB';
  state: GameState;       // see § 6
  startsAt: string;       // ISO
  period?: string;        // 'Q3', '2H', etc., only when live
  clock?: string;         // '7:42', only when live
  home: TeamGameState;
  away: TeamGameState;
  spread?: number;
  total?: number;         // O/U
  insight?: string;       // generated one-liner from template library
};

export type GameState = 'scheduled' | 'live' | 'final' | 'cancelled' | 'postponed';
```

When the backend starts emitting `algoId` / `algoVersion` / `computedAt` (planned in foundation Plan B), the mobile app can start surfacing them where useful (probably timestamp tooltips) without rework.

### TanStack Query setup

A single QueryClient at the root, configured in `app/_layout.tsx`:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // No retry on typed errors (those represent the backend's intended state)
        if (error instanceof ApiError && error.type !== 'NetworkError') return false;
        return failureCount < 2;
      },
      staleTime: 5_000,        // 5s default
      gcTime: 60 * 60 * 1_000, // keep in cache for 1h after last subscriber
      refetchOnWindowFocus: true,
    },
  },
});
```

Per-screen hooks override `staleTime` and `refetchInterval` as documented in § 2.

### Focus-aware polling

Wire TanStack Query's `focusManager` to the React Native AppState so polling pauses when the app is backgrounded:

```typescript
// lib/api/focus-manager.ts
import { AppState } from 'react-native';
import { focusManager } from '@tanstack/react-query';

AppState.addEventListener('change', (state) => {
  focusManager.setFocused(state === 'active');
});
```

### Caching and offline

For v1, treat the cache as best-effort and pragmatic:
- TanStack Query's in-memory cache provides natural "see last data" behavior when offline
- Cache the user's onboarding selections, follows, and preferences in AsyncStorage so the app boots usefully even with no network
- Do not implement full offline mode — the Live tab is meaningless offline

### Critical never-hardcode rules

- **Never hardcode `'basketball'`** anywhere. The mobile app architecture supports the platform's eventual expansion to other sports. Use a sport-type parameter even when v1 only exercises basketball. The follows API should accept `{ kind: 'team' | 'sport' | 'game', sportType?: SportType, ... }` — not `{ kind: 'team' | 'nba' | 'cbb' }`.
- **Never hardcode the base URL.** Use `EXPO_PUBLIC_API_BASE_URL` so dev and prod can point at different cores.
- **Never bypass the API client.** Even one-off `fetch` calls go through `apiFetch`. This is what makes the future contract migration cheap.

---

## 8. Template library specification (skeleton)

The template library is the single source of truth for all generated copy in the app (live alert one-liners, pregame insights, swinger narratives) and on social. Content fill-in happens in a separate session — this section locks the *skeleton*.

### Three template families

**Family 1 — Live alert one-liners**

Generated when an alert fires. Drives the bottom text of Live tab game cards, the "WHAT'S HAPPENING" line on Alert Detail, and the one-liner under the scoreboard on Game Detail.

Schema:
```typescript
// lib/templates/alerts.ts
type AlertTemplate = {
  alertType: 'bluffing' | 'comeback' | 'swing-warning';
  severity: 'low' | 'medium' | 'high';     // based on the momentum gap
  template: string;                         // with `{vars}` placeholders
};
type AlertTemplateVars = {
  trailingTeam: string;
  leadingTeam: string;
  pointGap: number;
  momentumPct: number;
  // ...
};
function renderAlertOneLiner(type, severity, vars): string;
```

Content: TBD next session. Schema and renderer locked.

**Family 2 — Pregame insight one-liners**

Generated for the Pregame 411 paragraph. Matrix based on each team's MVIX trend (steady vs chaotic) and Avg Momentum trend (rising vs falling):

```typescript
type PregameMatchupType =
  | 'steady-rising-vs-steady-rising'
  | 'steady-rising-vs-chaotic-falling'
  | 'chaotic-falling-vs-steady-rising'
  | ...  // 2x2x2x2 grid = 16 combinations, but only the meaningful ones populated
```

Content: TBD next session.

**Family 3 — Swinger narrative paragraphs**

Generated for the Swinger Detail modal narrative paragraph. Template + data fill:

```typescript
type SwingerNarrativeTemplate = {
  role: 'primary-scorer' | 'playmaker' | 'lockdown-defender' | 'two-way-engine' | 'spark-plug' | ...;
  template: string;
};
```

Content: TBD next session.

### Explain modal content (10 entries)

```typescript
// lib/templates/explain.ts
type ExplainContent = {
  id: 'momentum' | 'mvix' | 'mrvi' | 'swingers' | 'bluffing' | 'comeback' | 'swing-warning' | 'hit-rate' | 'push-notifications' | 'avg-momentum';
  fullName: string;                  // "Momentum Volatility Index"
  pronunciation?: string;            // "EM-VIX"
  shortLabel: string;                // "MVIX"
  definition: string;                // 1-2 sentence plain-English definition
  highlights: string[];              // phrases within `definition` to color sky blue
  anchors: [                         // exactly 3 value anchors
    { value: string; label: string; description: string; color: 'green' | 'yellow' | 'red' },
    { value: string; label: string; description: string; color: 'green' | 'yellow' | 'red' },
    { value: string; label: string; description: string; color: 'green' | 'yellow' | 'red' },
  ];
  whyItMatters: string;              // the boxed callout
};

export const EXPLAIN_CONTENT: Record<ExplainId, ExplainContent>;
```

Content for all 10 entries: TBD next session. Schema locked.

### Delta direction conventions

Locked, for consistency across the app:

- **Average Momentum delta:** ↑ green / ↓ red ("playing better" / "playing worse")
- **MVIX delta:** ↓ green / ↑ red ("more steady" / "more chaotic")
- **Hit Rate delta:** ↑ green / ↓ red
- **Score (in HIT/PUSH/MISS receipts):** team that outscored = colored in their team display color; difference number = green if exceeds HIT threshold, yellow if PUSH range, red if MISS

These conventions live as TypeScript constants in `lib/templates/conventions.ts` and any UI rendering deltas reads from there.

---

## 9. Notification system

### The four tiers (per team, per game, per sport)

| Tier | Triggers | UI label | Icon | Color |
|---|---|---|---|---|
| **ALL** | Pre-game tip, all alerts, period ends, final | "ALL" | (none, just text) | sky blue |
| **ALERTS** | Only Bluffing/Comeback/Swing Warning alerts | "ALERTS" | bolt (⚡) | alert red |
| **PERIOD** | Period ends + final (NOT "FINAL ONLY" — both) | "PERIOD" | flag | alert yellow |
| **OFF** | No pushes | "OFF" | struck-through bell | textTertiary gray |

**Critical:** PERIOD is *period ends + final*, not "final only." Naming this carefully matters because users will tap "PERIOD" expecting to know when the 1st quarter ends, not just when the game ends.

### Defaults

- Sports followed during onboarding: ALERTS tier by default
- Teams followed during onboarding: ALERTS tier by default
- Per-game follows (added later via Game Detail bell icon): ALERTS tier by default
- Users can change any tier from Following tab (long-press a row or tap chevron → tier picker modal)

### Tier resolution (which tier wins when multiple follows apply)

When the same game qualifies for multiple follow rules (user follows both teams, follows the game directly, follows the sport), use the most permissive tier:

`OFF < PERIOD < ALERTS < ALL`

Example: user follows the NBA at ALERTS tier and also follows the Lakers at ALL tier. For a Lakers game, they get ALL tier notifications.

### Push permission flow

1. User completes onboarding (lands on Live tab)
2. After 2 seconds on the Live tab, surface a small banner: "Get push alerts when momentum swings. Enable notifications →"
3. Tap → trigger Expo Push permission request
4. On grant → register token with the backend (`POST /api/user/push-token`)
5. On deny → banner stays dismissed; user can re-enable from Profile → Account → Notifications

Do not surface the permission request *during* onboarding. The user hasn't seen the value yet at that point.

### Deep-link payload structure

Every push notification carries a structured payload that deep-links into the right screen:

```typescript
type PushPayload = {
  type: 'alert' | 'period' | 'final' | 'pregame';
  gameId: string;
  alertId?: string;        // present when type === 'alert'
  // ...
};
```

Handler logic (in `lib/push/handler.ts`):
- Tap on an `alert` push → open Alert Detail modal for that alertId
- Tap on a `period` push → open Game Detail for that gameId
- Tap on a `final` push → open Game Detail for that gameId (final state)
- Tap on a `pregame` push → open Game Detail for that gameId (pregame state)

If the app is cold-launched from a push, the deep-link applies after onboarding (if needed) and after the initial Live tab load.

### Push token lifecycle

- Register on permission grant
- Re-register on app launch (Expo Push tokens can rotate)
- Unregister on sign-out

---

## 10. Beta distribution

### TestFlight (iOS)

- App built via EAS Build with the `production` profile
- Submitted to App Store Connect via EAS Submit
- Internal testers added by Apple ID email — they receive an invite to install via TestFlight
- No App Review required for internal testing (up to 100 internal testers)
- External testing (up to 10,000 external testers) requires Beta App Review — defer to v1.x if the friend audience grows past 100

### Google Play Internal Testing

- App built via EAS Build with the `production` profile
- Submitted to Play Console as an Internal Testing release
- Internal testers added by Google account email (up to 100)
- No Play Review required for internal testing

### EAS configuration

`eas.json`:
```json
{
  "build": {
    "production": {
      "node": "24.0.0",
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://the-swing.vercel.app"
      }
    },
    "dev": {
      "developmentClient": true,
      "distribution": "internal"
    }
  },
  "submit": {
    "production": {
      "ios": { "ascAppId": "TBD - get from App Store Connect after first submission" },
      "android": { "track": "internal" }
    }
  }
}
```

### App icon and splash

- App icon: SWING wordmark on navy background, sized per platform requirements
- Splash screen: navy background with sky blue SWING wordmark centered
- Both generated and placed in `assets/` by the implementer

### Required metadata

For initial submission, the implementer needs to draft and confirm with Zane:
- App Store / Play Store description (1-2 paragraphs)
- Keywords / categories
- Privacy policy URL (Zane to provide)
- Support contact email (Zane to provide)
- 3-5 screenshots per platform (generated from the running app via Xcode Simulator and Android Emulator)

---

## 11. Backend rollup jobs

These are documented here for mobile-app reference only. The actual job implementation is backend territory (see foundation plan and architecture lifecycle spec). The mobile app *consumes* these jobs' outputs via the API.

| Job | Output | Frequency | Mobile consumer |
|---|---|---|---|
| `user_snapshots` | Per-user Followed Alerts count, Hit Rate (+ delta vs 30 days ago), Best Call (last 30 days) | Nightly | Profile screen, `useUserSnapshot()` |
| `team_pregame_stats` | Per-team rolling L10 MVIX, Avg Momentum, Top 3 Swingers | Nightly | Game Detail pregame state, `useGamePregameStats()` |
| `ats_results` | Per-game closing spread + final score (forward-looking only — Pro tier doesn't include historical odds archive) | Nightly | Game Detail Recent Form section |
| `alert_grading` | 4:30 post-fire grading — writes HIT/PUSH/MISS state to alert records | 4:30 after each alert fires | Alerts tab "Earlier Today" section, Following tab Games view "Recently Finished" receipts |

### Mobile-side caching of rollup data

User snapshot, pregame stats, and ATS results don't change during a session. TanStack Query default `staleTime: 5_000` is too aggressive for these — override per-hook to `staleTime: 5 * 60 * 1_000` (5 minutes). Pregame stats can go even longer (30 minutes).

### Graceful degradation

If a rollup job hasn't run for a particular team/user/game (new addition, missed run, etc.), the corresponding API endpoint may return partial data or empty fields. Mobile screens must handle this:
- Profile snapshot with missing fields: show the stat cards that have data, hide the ones that don't (don't render "0" — that's a number, not a missing-data state)
- Pregame 411 with missing pregame stats for one team: show the available team's data, render "Pregame data unavailable for [team]" in place of the missing side

---

## 12. Known limitations and v1 polish items

### Data limitations

- **ESPN public API on day one.** Sportradar deferred until the platform can afford the access. Swinger Detail "Last 12 Possessions" stat grid (Scored On / Assists / Stops / Turnovers) cannot be fully populated from ESPN — render available fields, em-dash the rest. See § 6.11.
- **ATS data is forward-looking only.** The Odds API Pro tier ($29/mo, confirmed funded) doesn't include historical odds archive (Business tier at $99/mo does, deferred). Recent Form ATS displays "—" for games predating the v1 launch date.
- **Algorithm versioning columns not yet emitted.** Foundation plan Plan B will add `algo_id` / `algo_version` / `computed_at` to derived metric rows. Mobile types treat them as optional and absorb them automatically when emitted. See § 7.
- **Typed source-failure responses not yet emitted.** Foundation plan Plan E will adopt the `503 + { type, message, retryAfter? }` taxonomy. Mobile error handling is wired for this future contract; in the interim, empty 200s are treated as generic "data unavailable." See § 7.

### Display limitations

- **Team logos: deferred to v2.** Circular team-color avatars with abbreviations only.
- **Some team primary colors fail contrast against navy.** Use `display` color overrides per § 5.

### Functional limitations

- **No signup flow.** Auth is via TestFlight / Play Internal invite. No "create account" UI.
- **No subscription / payment UI.** Pre-monetization.
- **No "Rate this app" prompt in settings.** Will be added in v1.x as a contextual prompt after a successful HIT alert (not a generic settings toggle).
- **Search modal on Live tab and Following tab:** v1 stub. Render the modal entry point but the modal itself is "Coming soon" placeholder.
- **Settings sub-screens in Profile (Appearance, Odds & betting display, Privacy & data):** v1 stub. Functional Notifications screen only.
- **Invite a friend:** v1 stub. Share sheet works but the invite link is placeholder.

### Performance targets (v1)

- Cold start to Live tab visible: < 3 seconds on modern hardware (iPhone 12 / Pixel 6 or newer)
- Tab switch latency: instant (under 100ms)
- Game Detail open: < 1 second to scoreboard visible, momentum chart can lazy-load
- Pull-to-refresh: data refresh completes in < 2 seconds on a good connection

If any of these regress significantly during development, file it and surface to Zane.

---

## 13. Build sequence recommendation

When starting from a clean `apps/casual-fan-mobile/` directory (which is the state after foundation plan Phase 1), execute in this order:

### Phase A — Foundation (1-2 sessions)

1. Initialize Expo project: `npx create-expo-app@latest apps/casual-fan-mobile --template default`
2. Add TypeScript strict mode, configure `tsconfig.json` with path aliases
3. Install core dependencies: TanStack Query, Zustand, react-native-reanimated, react-native-gesture-handler, react-native-svg, lucide-react-native, expo-router, expo-font, date-fns, @react-native-async-storage/async-storage, expo-notifications
4. Set up project structure per § 3
5. Build `lib/theme/` with all design tokens from § 4
6. Build `lib/api/client.ts` with the typed error taxonomy
7. Build `lib/teams/teams.json` with starter list and `lib/teams/lookup.ts`
8. Set up `expo-router` shell with onboarding gate logic
9. Configure fonts loading via `expo-font`
10. Verify dev build runs on iOS Simulator and Android Emulator

### Phase B — Component primitives (1 session)

1. Build `components/ui/` primitives: `Button`, `Card`, `Pill`, `Badge`, `Avatar`, `ProgressBar`, `Sparkline`, `Stat`
2. Build `components/layout/`: `Screen`, `Row`, `Stack`
3. Build a Storybook-like screen at `app/dev/components.tsx` (only in `__DEV__`) that renders every primitive in every variant for visual review

### Phase C — Live tab (1-2 sessions)

1. Build feature components in `features/live/`
2. Wire `useLiveGames()` to the existing `/api/live` endpoint
3. Implement the Live tab screen, filter pills, polling
4. Implement empty and error states
5. Test against the real backend (`the-swing.vercel.app`)

### Phase D — Game Detail (2-3 sessions, the biggest screen)

1. Build pregame state first (no time-series chart, simpler)
2. Build live state (with time-series chart using react-native-svg)
3. Build final state
4. Wire all data hooks, polling for live state
5. Test against real backend games at all three states

### Phase E — Onboarding (1 session)

1. Build the three swipeable cards
2. Wire AsyncStorage gating logic
3. Wire bulk follows POST
4. Hook up navigation

### Phase F — Alerts and Following tabs (2 sessions)

1. Alerts tab: live + earlier today sections, filter pills
2. Following tab: Teams view, Sports view, Games view
3. Tier picker modal
4. Follow mutations with optimistic updates

### Phase G — Profile and modals (1-2 sessions)

1. Profile screen with snapshot cards
2. Stub sub-screens for settings rows
3. Alert Detail modal
4. Swinger Detail modal
5. Explain modal (one component, parameterized by metric ID)

### Phase H — Push notifications (1 session)

1. Wire Expo Push Notifications
2. Permission flow with delayed prompt
3. Token registration with backend
4. Deep-link payload handling

### Phase I — Beta distribution (1 session)

1. App icon and splash
2. EAS Build configuration
3. First TestFlight build and submission
4. First Play Internal Testing build and submission

### Total estimate

12-15 focused sessions for v1 complete. Some sessions may run long; some will spill across. The above is a sequence, not a deadline.

### Order rationale

- **Foundation first** so every later piece builds against the right primitives
- **Live tab before Game Detail** so we have a working entry point to navigate from
- **Game Detail before everything else** because it's the most complex screen and reveals the most edge cases — surfacing those early de-risks the rest of the build
- **Onboarding after the main screens are partially working** so we have something for testers to land on after onboarding
- **Push and beta distribution last** because they're the most environmental (TestFlight setup, push tokens) and benefit from a mostly-working app to test against

---

## 14. Working assumptions and open items

These need confirmation or future resolution. The build proceeds against the working assumption until updated.

| # | Item | Working assumption | Resolution path |
|---|---|---|---|
| 1 | Package name | `apps/casual-fan-mobile/` | Confirm with @zhopen11 against final workspace naming convention; may become `apps/casual-fan/mobile/` or similar |
| 2 | `@swing/shared` ESM compatibility for React Native | Will work; if not, add an ESM export entry or transpile path | Test during Phase A; flag to @zhopen11 if issues arise |
| 3 | Search functionality (Live tab, Following tab) | Stub modal with "Coming soon" placeholder for v1 | Spec real search behavior in v1.x |
| 4 | Settings sub-screens (Appearance, Odds & betting display, Privacy & data) | Stub screens for v1; functional Notifications screen only | v1.x roadmap |
| 5 | Team detail screen (tap a team in Following) | v1: route to next/current game for that team instead of a dedicated team detail screen | Spec real team detail in v2 |
| 6 | "Open dashboard" CTA on Alert Detail modal | v1: dismiss modal and route to Live tab | Confirm with Zane; alternative is opening a web view |
| 7 | Favorite star on Game Detail | Toggles follow on the home team (best guess) | Confirm with Zane |
| 8 | Feedback / bug report mailto: address | `feedback@theswing.app` (placeholder) | Get real address from Zane |
| 9 | Privacy policy URL for app store metadata | Placeholder | Zane to provide before first submission |
| 10 | Support contact email for app store metadata | Placeholder | Zane to provide before first submission |
| 11 | Real-time data strategy long-term | v1: polling; future: TBD by core-to-app contract child spec | Watch for that spec; mobile data layer is wired to swap |
| 12 | Algorithm versioning fields surfacing | v1: types include them optionally, UI ignores them | Foundation Plan B will emit them; spec surfacing in v1.x |
| 13 | Typed source-failure error responses | v1: types ready, fallback handling for empty 200s | Foundation Plan E will emit them; mobile UI auto-upgrades |
| 14 | Sportradar migration | Deferred until access is funded | Mobile types optional-field the richer Sportradar data so the migration is non-breaking |

---

## 15. Glossary

- **Core** — A per-sport, per-league data backend. The basketball core powers `the-swing.vercel.app` and this mobile app. Headless, no user accounts. Defined in the architecture overview spec.
- **Application** — An audience-shaped client of one or many cores. The "casual fan" application has two clients in v1: the web app at `apps/casual-fan/` and this mobile app at `apps/casual-fan-mobile/`. User accounts live here.
- **Momentum** — A 0-100 score per team derived from a sliding window of the last 12 possession-level events.
- **MVIX (Momentum Volatility Index)** — How wildly a team's momentum has been swinging. High MVIX = chaotic. Low MVIX = steady.
- **MRVI (Momentum Relative Volatility Index)** — Direction of momentum swings (CBB-specific, adapted from Dorsey RVI).
- **Swinger** — A player whose individual contributions are driving momentum during a stretch.
- **Swing Score** — A player's contribution number for a given window (typically last 12 possessions).
- **Average Momentum** — Team's L10-game rolling average momentum value. Captures team "quality" over time.
- **Bluffing** — Alert type: scoreboard leader is not the momentum leader.
- **Comeback Watch** — Alert type: trailing team has dominant momentum.
- **Swing Warning** — Alert type: score is close/tied but one team has overwhelming momentum.
- **HIT / PUSH / MISS** — Grading outcome for each alert, computed 4:30 of game time after fire. Thresholds vary by alert type (see § 16).
- **L10 / L12** — "Last 10" / "Last 12" (games or possessions).
- **SU / ATS** — Straight Up / Against The Spread. Used in Recent Form section of Pregame 411.
- **Pregame 411** — The rich pregame insight card on Game Detail's scheduled state.

---

## 16. Appendix: HIT/PUSH/MISS grading thresholds

The grading window is 4:30 of *game time* after the alert fires (chosen to align with media timeout cadence — the typical media timeout takes 3+ minutes of real time, so 4:30 of game time covers it).

| Alert type | HIT | PUSH | MISS |
|---|---|---|---|
| **Bluffing** | Flagged team outscores opponent by 3+ in the next 4:30 of game time | 1-2 points or tie | Opponent outscores flagged team |
| **Comeback Watch** | Flagged team outscores opponent by 4+ OR closes the deficit entirely | 1-3 points | Opponent extends lead OR outscores flagged team |
| **Swing Warning** | Flagged team outscores opponent by 6+ | 3-5 points | Below 3 points |

These thresholds are documented here for mobile-app reference. The actual grading is performed server-side by the `alert_grading` rollup job (§ 11). The mobile app displays the HIT/PUSH/MISS state but does not compute it.

---

End of spec. Update this file whenever a decision is made or a working assumption is resolved.
