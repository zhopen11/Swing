# Sim Mode Design

**Date:** 2026-05-14  
**Target replay window:** March 20, 2026 · 9:00–9:30 PM ET  
**Purpose:** Demo The Swing mobile app with 20+ simultaneous games and real alert activity for screenshots/screen recordings

---

## Background

The NBA playoffs currently provide only one game per night, making it impossible to demo the app's full live grid. This feature replays a real 30-minute window from the NCAA Tournament first round weekend (March 20, 2026), when 25 games were active simultaneously (7 NBA + 18 NCAA Tournament) and 6 games were firing alerts concurrently at the 9:00–9:30 PM ET peak. All data is real — logged by the live system.

---

## Architecture

### 1. Pre-compute Script (`app/scripts/build-sim-replay.mjs`)

A one-time script that generates the replay data file. Run once, committed to the repo.

**What it does:**
- Fetches the ESPN scoreboard for March 20, 2026 to get all game metadata (teams, start times, ESPN IDs)
- For each game active during the 9:00–9:30 PM ET window, fetches the full ESPN play-by-play summary
- Maps each game's plays to approximate wall-clock time using linear interpolation: `wallTime = gameStart + (playIndex / totalPlays) * gameDuration`
- Generates 31 frames — one per minute from 9:00 PM through 9:30 PM ET
- For each frame, for each game: computes status (pre-game / live / final), score, period, clock, truncated momentum chart (plays up to that wall-clock time), and active alert flags (bluffing / comeback / swingWarning) using the existing `computeMomentumFromPlays` and `detectAlerts` functions
- Writes output to `app/data/sim/20260320.json`

**Output shape:**
```json
{
  "date": "20260320",
  "windowStart": "2026-03-20T21:00:00-04:00",
  "windowEnd": "2026-03-20T21:30:00-04:00",
  "frames": [
    {
      "frameIndex": 0,
      "simTime": "2026-03-20T21:00:00-04:00",
      "label": "9:00 PM",
      "games": [
        {
          "id": "...",
          "league": "NBA",
          "status": "STATUS_IN_PROGRESS",
          "awayAbbr": "PHX", "homeAbbr": "SA",
          "awayScore": 42, "homeScore": 38,
          "period": 2, "clock": "8:14",
          "awayMomentum": 58, "homeMomentum": 42,
          "chartAway": [...], "chartHome": [...],
          "bluffing": false, "comeback": false, "swingWarning": true
        }
      ]
    }
  ]
}
```

**Games included:** All games with status STATUS_IN_PROGRESS or STATUS_SCHEDULED during the window, plus games that completed during it (STATUS_FINAL shown at their final state).

---

### 2. Sim API (`app/app/api/sim/route.js`)

A simple read endpoint. Returns all 31 frames at once so the mobile client can hold them in memory and scrub without network calls.

- `GET /api/sim` → returns `{ frames: [...] }` from the pre-computed JSON file
- No query params needed — there is only one replay (March 20)
- Response is cacheable (static data, never changes)

---

### 3. Mobile Sim Mode

#### Activation
Hidden: 5 rapid taps on the "SWING" wordmark in the Live tab header. No visible button — this is a demo tool, not a user feature.

#### State
A new Zustand store (`lib/store/sim.ts`) holds:
- `isActive: boolean`
- `frames: SimFrame[]` (loaded once on activation)
- `frameIndex: number` (0–30, controlled by scrubber)
- `isLoading: boolean`

#### UI changes when active (all in `live.tsx`)
1. **SIM banner** replaces the subtitle under "SWING": `SIM · MAR 20` in amber/yellow, with an `✕` tap target to exit
2. **Game list** renders from `frames[frameIndex].games` instead of `useLiveGames` hook data — no polling, no network
3. **Scrubber** fixed at the bottom of the screen (above safe area): a horizontal slider from 0–30 with `9:00 PM` and `9:30 PM` labels and a centered current-time label (e.g. `9:14 PM ET`) that updates as you drag

#### Data flow
- On activation: call `/api/sim`, store all 31 frames in the sim store, default to `frameIndex = 0`
- On scrub: update `frameIndex` in the store, game list re-renders from local data — no network call
- On exit: clear sim store, resume normal `useLiveGames` polling

#### Game card compatibility
Sim frames produce the same `GameDetail` shape as the live API — `LiveGameCard` and `UpcomingGameCard` render without modification. Games with `STATUS_SCHEDULED` at a given frame appear in the UPCOMING section; `STATUS_IN_PROGRESS` in LIVE NOW; `STATUS_FINAL` in FINAL.

---

## Alerts Tab in Sim Mode

The alerts screen already splits into **LIVE** (alerts for in-progress games) and **EARLIER TODAY** (alerts for finished games). Sim mode maps onto this naturally — no new card components needed.

### Alert events in the replay file

The pre-compute script also queries `alert_logs` for March 20 alerts that fall within the 9:00–9:30 PM ET window and outputs them as a sorted `alertEvents` array alongside the frames:

```json
{
  "alertEvents": [
    {
      "frameIndex": 3,
      "simTime": "2026-03-20T21:03:00-04:00",
      "id": "...",
      "gameId": "...",
      "type": "bluffing",
      "awayAbbr": "PHX", "homeAbbr": "SA",
      "awayScore": 49, "homeScore": 45,
      "period": 2, "clock": "5:12",
      "awayMomentum": 38, "homeMomentum": 62
    }
  ]
}
```

### Derived state in sim store

```ts
firedAlerts = alertEvents.filter(e => e.frameIndex <= currentFrameIndex)
```

Each fired alert also needs a `result` field (used by the alerts screen to split LIVE vs EARLIER TODAY). This is derived by checking whether the alert's game has `STATUS_FINAL` in the current frame — if so `result = true`, otherwise `result = false`.

### `alerts.tsx` change

When sim is active, `useAlerts()` is bypassed and `firedAlerts` from the sim store is used instead. The LIVE / EARLIER TODAY split, filter pills, `LiveAlertCard`, and `FinishedAlertCard` all render without modification. The scrubber is shared with the live tab via the same sim store — both tabs stay in sync automatically.

---

## Files Changed

| File | Change |
|------|--------|
| `app/scripts/build-sim-replay.mjs` | New — pre-compute script |
| `app/data/sim/20260320.json` | New — generated replay data |
| `app/app/api/sim/route.js` | New — serves replay frames |
| `apps/casual-fan-mobile/lib/store/sim.ts` | New — sim Zustand store |
| `apps/casual-fan-mobile/app/(tabs)/live.tsx` | Modified — sim activation, banner, scrubber, conditional data source |
| `apps/casual-fan-mobile/app/(tabs)/alerts.tsx` | Modified — conditional data source (sim store vs useAlerts hook) |

---

## Constraints

- `computeMomentumFromPlays` and `detectAlerts` are reused as-is — no changes to core logic
- `GameDetail` shape is unchanged — existing card components render sim data without modification
- Sim mode is invisible unless activated — no code paths change for normal users
- The replay file is committed to the repo so the demo works with zero setup (no script to re-run)
- ESPN play-to-walltime mapping is approximate (linear interpolation) — good enough for a demo, not meant to be frame-accurate

---

## Out of Scope

- Multiple replay dates
- Auto-advance / time-lapse playback
- Sim mode on any screen other than the Live tab
- Pushing a new TestFlight build — this will be shipped as an OTA update via `eas update`
