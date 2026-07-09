# Summer League Feed Probe — July 9, 2026

Probe run before the Vegas SL opener (Jazz @ Wizards, 9pm ET). Completed game data is from the SLC Summer League (nba-summer-utah), since Vegas SL kicked off today and no completed Vegas games exist yet. Live structure verified against the tonight's scheduled event on the Vegas slug.

---

## 1. Feed Discovery

### Scoreboard Slug

**`nba-summer-las-vegas` → WORKING**

Returns 7 games scheduled for July 9, 2026. League metadata: id=63, abbreviation=`NBALV`, name="Las Vegas Summer League". Season type=2 (Preseason).

The regular `nba` scoreboard does **not** include SL games. SL has its own dedicated slug and endpoint.

SLC Summer League slug also confirmed: `nba-summer-utah` (used for completed-game validation below).

### Tonight's Games (July 9)

| Event ID | Matchup | ET |
|---|---|---|
| 401881822 | MIN @ NOP | 3:30 PM |
| 401881823 | SAS @ ATL | 4:30 PM |
| 401881824 | DET @ PHI | 5:30 PM |
| 401881825 | GSW @ DAL | 7:00 PM |
| 401881826 | CHA @ ORL | 7:30 PM |
| **401879488** | **UTAH @ WSH** | **9:00 PM** |
| 401881827 | SAC @ LAC | 11:00 PM |

### Summary Endpoint — CRITICAL FINDING

`nba/summary?event=401879488` → **HTTP 404**

`nba-summer-las-vegas/summary?event=401879488` → **200 OK**

The current app's `fetchGameSummary` builds `nba/summary?event=ID` for NBA league games. This will 404 on every Summer League event. The summary URL must use the SL slug.

---

## 2. Plays Array (SLC Completed Game: Grizzlies 111–74 Thunder, July 4)

Source: `nba-summer-utah/summary?event=401879920`

### Existence and Volume
Plays array: **EXISTS**. 110+ plays returned for a complete game.

### Sample Plays (all fields)

```
Play 1 — Jumpball
  type: "615" | text: "Taylor Hendricks vs. Aday Mara (Cedric Coward gains possession)"
  scoreValue: 0 | shootingPlay: false | team.id: "29"
  period: 1 | clock: "10:00" | homeScore: 0 | awayScore: 0

Play 2 — Layup
  type: "95" | text: "Cameron Boozer makes layup (Taylor Hendricks assists)"
  scoreValue: 2 | shootingPlay: true | team.id: "29"
  period: 1 | clock: "9:36" | homeScore: 0 | awayScore: 2

Play 3 — Three-pointer
  type: "92" | text: "Cedric Coward makes 22-foot three point jumper ..."
  scoreValue: 3 | shootingPlay: true | team.id: "29"
  period: 1 | clock: "9:03" | homeScore: 2 | awayScore: 5

Play 4 — Turnover
  type: "62" | text: "Josh Dix bad pass turnover (Cedric Coward steals)"
  scoreValue: 0 | shootingPlay: false | team.id: "25"
  period: 1 | clock: "7:36" | homeScore: 4 | awayScore: 13

Play 5 — Substitution
  type: "584" | text: "Payton Sandfort enters the game for Josh Dix"
  scoreValue: 0 | shootingPlay: false | team: (present)
  period: 1 | clock: "7:27"
```

Quarter clock counts **down from 10:00**, confirming 10-minute quarters in live play data.

### Team Attribution

~95%+ of plays have `team.id` populated. Only administrative events (some timeouts, shot clock violations) lack team attribution. **Well above the 90% threshold — proceed.**

### Event Type Inventory

Type codes found (ESPN encodes type as a numeric string + text):

| Type Code | Text (approx) | Handled by engine? |
|---|---|---|
| 615 | Jumpball | Not scored (scoreValue=0, not shooting) — filtered |
| 95 | Layup | ✓ (shootingPlay=true, text "makes layup") |
| 92 | Three-pointer | ✓ (scoreValue=3, text "makes...three") |
| 131 | Pullup Jump Shot | ✓ |
| 132 | Step Back Jumpshot | ✓ |
| 139/145 | Two-point shot variants | ✓ |
| 146 | Running Pullup Jump Shot | ✓ |
| 115 | Driving Dunk | ✓ |
| 62/63/69/84/90 | Turnover variants (bad pass, lost ball, etc.) | ✓ (text matching "turnover", "bad pass") |
| 155/156 | Rebound (offensive/defensive) | ✓ (text matching "rebound" + "offensive") |
| 42/44 | Foul variants | ✓ (type text "foul") |
| 238 | Free Throw 1 of 2 | ✓ (see FT section) |
| 239 | Free Throw 1 of 1 | ✓ (see FT section) |
| 16 | Timeout | Filtered (scoreValue=0, not shooting/rebound/turnover/steal) |
| 584 | Substitution | Filtered |

**No unrecognized type strings break the engine.** The momentum engine pattern-matches on `play.text` and `play.type?.text` (lowercased strings), not on numeric type codes. All SL play texts follow the same convention as regular NBA ("makes", "misses", "rebound", "turnover", "steal", "block", "fast break").

---

## 3. Free Throw Events and the One-FT Rule

### What the SLC feed shows

```
"Free Throw - 1 for 2": type=238, scoreValue=0 (missed)
"Free Throw - 1 for 1": type=239, scoreValue=1 (made)
```

Both types have `shootingPlay: true`.

### Interpretation

Type 239 ("Free Throw 1 of 1") is the one-FT rule play type. In the SLC game, the made one-FT shows `scoreValue: 1`. This may mean ESPN encodes the FT attempt value as 1 regardless of how many points the trip is worth (the running `homeScore`/`awayScore` totals would still reflect the correct game score).

### Impact on momentum engine

The engine reads `val = play.scoreValue || 0` and branches on `val === 1` (FT), `val === 2` (2pt), `val === 3` (3pt). With `scoreValue: 1`, a made one-FT routes to `WEIGHTS.makeFT` (0.8). This is the correct code path.

**LIVE VERIFICATION NEEDED:** We cannot confirm how ESPN encodes a made one-FT rule play worth 2 or 3 points until a Vegas SL game is in progress. If `scoreValue` is 2 for a 2-pt FT trip, it routes to `make2` (weight 2.0) instead of `makeFT` (0.8). This won't crash but changes weighting slightly. **Do not adjust thresholds either way.**

The app uses `play.homeScore` / `play.awayScore` running totals from ESPN for all displayed scores — no score reconstruction from `scoreValue` — so scoreboard accuracy is unaffected regardless of how FT values are encoded.

---

## 4. Period and Clock Metadata (from pre-game Vegas SL summary)

```
regulation: { periods: 4, displayName: "Quarter" }
quarter duration: 600 seconds (10 minutes)
OT duration: 300 seconds (5 minutes)
```

These are explicitly in the competition format object. **Confirmed: 10-minute quarters, 5-minute OT.**

---

## 5. Hardcoded 12-Minute Constants (Phase 2 fix targets)

These locations assume `12 * 60` for NBA period duration and will compute wrong values for SL games:

| File | Line | What it does |
|---|---|---|
| `app/components/Sparkline.jsx` | 58 | `periodMins = league === 'NBA' ? 12 : 20` — used in `gameSecondsElapsed()` for the "last 3 game-minutes" highlight range |
| `lib/mvix.js` | 8 | `periodSecs = league === 'NBA' ? 12 * 60 : 20 * 60` — used in MVIX volatility calculation |
| `lib/swing-impact.js` | 125 | Same pattern — used for clutch-window calculation |
| `app/api/analysis/[gameId]/route.js` | 21, 89 | Same pattern — used in game analysis |

The alerts engine (`lib/alerts.js`) has NO hardcoded period duration — it uses raw clock seconds from the feed and is safe as-is.

The momentum engine (`lib/momentum.js`) uses a **play-count window** (`WINDOW=12` plays), not a time window, and has NO period duration dependency. Safe as-is.

---

## 6. Current App Blockers (will not show SL games without fixes)

1. **No SL scoreboard fetch**: `fetchNbaScoreboard` only hits `nba` slug. SL events never appear.
2. **Wrong summary URL**: `fetchGameSummary` calls `NBA_SUMMARY(id)` which builds `nba/summary?event=ID` → 404 on all SL events.
3. **No SL config values**: No `SL_SCOREBOARD` or `SL_SUMMARY` URL in `lib/config.js`.
4. **No Summer League badge**: `GameCard.jsx` shows `{g.league}` in the top bar. No visual differentiation for SL.
5. **`parseScoreboardEvent` league tagging**: If SL games are tagged `league: 'NBSL'`, the alert suppression in `alerts.js` (`game.league === 'NBA' && period === 4`) won't fire. Recommend tagging as `league: 'NBA'` + separate `isSummerLeague: true` flag.

---

## 7. Polling Behavior

The ESPN SL scoreboard respects the same cache-busting `_t=` timestamp the app already appends. The 10-second poll loop in `POLL_INTERVAL: 10` is compatible. No rate-limit signals observed in any of the probe requests.

---

## 8. Team ID Mapping

Vegas SL uses standard NBA team IDs:
- Washington Wizards: id=27, abbr=WSH ✓
- Utah Jazz: id=26, abbr=UTAH ✓
- Team colors and logos from the regular NBA team objects are present on the competitor objects.

Existing team color/avatar lookups will work without modification.

---

## Go / No-Go

**GO for Phase 2.** Feed is clean:
- Attribution ~95% (above 90% threshold)
- No unrecognized event types
- Clock and period fields present and correct
- Score running totals reliable

**Open items requiring live game verification tonight:**
- How ESPN encodes made one-FT rule attempts (`scoreValue` = 1 or 2?)
- Confirm plays array populates for Vegas SL specifically (confirmed for SLC, structure should be identical)
- Alert fire rate — observe and report, do not tune
