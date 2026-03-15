# Momentum Volatility Index (MVIX) — Technical Specification & Analysis

## Overview

MVIX is a derivative-based volatility index for basketball momentum, analogous to the stock market's VIX. It measures how erratic a team's momentum swings are during a game, computed from ESPN play-by-play data via The Swing's momentum engine.

## API Endpoint

```
GET /api/analysis/[gameId]?date=YYYYMMDD
```

- `gameId` — ESPN event ID
- `date` — optional, YYYYMMDD format. If omitted, checks today's poll cache. If provided, fetches that day's scoreboard from ESPN on demand.

## Calculation Pipeline

### Step 1: Momentum Values

The momentum engine processes ESPN play-by-play events through weighted scoring:

| Event | Weight |
|---|---|
| Made 3-pointer | +3.0 |
| Missed 3-pointer | -1.2 |
| Made 2-pointer | +2.0 |
| Missed 2-pointer | -0.8 |
| Made free throw | +0.8 |
| Missed free throw | -0.4 |
| Turnover | -2.5 |
| Steal | +1.8 |
| Block | +1.2 |
| Offensive rebound | +1.5 |
| Defensive rebound | +0.6 |
| Foul | -0.3 |
| Fast break | +2.5 |

Raw scores are accumulated in a sliding window of 12 plays per team, then normalized to a 5–95 scale:

- **CBB**: Raw range [-15, 15]
- **NBA**: Raw range [-22, 22] (wider due to higher shooting %, more 3s, fewer turnovers)

Midpoint for both leagues: 50.

### Step 2: First Derivative (Velocity)

Rate of change of momentum using central differences on game-clock time:

```
For interior points:
  dv[i] = (v[i+1] - v[i-1]) / (t[i+1] - t[i-1])

For endpoints:
  dv[0] = (v[1] - v[0]) / (t[1] - t[0])           (forward difference)
  dv[n] = (v[n] - v[n-1]) / (t[n] - t[n-1])       (backward difference)
```

Where `t` is game-clock elapsed time (not wall clock), computed from period number and clock display:

```
gameSeconds = (period - 1) * periodLength + (periodLength - clockRemaining)
```

- NBA period length: 720 seconds (12 minutes)
- CBB period length: 1200 seconds (20 minutes)

Units: momentum points per second.

### Step 3: Second Derivative (Acceleration)

Rate of change of velocity, computed identically to Step 2 but applied to the first derivative series:

```
d2v[i] = (dv[i+1] - dv[i-1]) / (t[i+1] - t[i-1])
```

Units: momentum points per second squared.

### Step 4: Inflection Points

Points where the second derivative crosses zero — momentum is shifting direction.

For each inflection, the API returns:
- `period` / `clock` — game clock position
- `elapsedTime` — total elapsed game time (MM:SS)
- `elapsedSeconds` — elapsed in seconds
- `momentum` — momentum value at inflection
- `upward` — boolean, `true` if momentum was rising at this point
- `plays` — the 3 plays before and 3 plays after the inflection point, with `isInflectionPlay: true` marking the closest play

### Step 5: MVIX Computation

#### Raw Volatility
Standard deviation of the first derivative (velocity) series:

```
volatility = stddev(dv[0..n])
```

#### Exponentially Weighted MVIX
Recent play weighted heavier using exponential decay with a 5-minute emphasis window:

```
weight[i] = exp(3 * (recency[i] - 1))
where recency[i] = gameTime[i] / totalGameTime    (0 to 1)

weightedMean = Σ(dv[i] * weight[i]) / Σ(weight[i])
weightedVariance = Σ(weight[i] * (dv[i] - weightedMean)²) / Σ(weight[i])
weightedStdDev = sqrt(weightedVariance)
```

Normalized to 0–100 scale:

```
mvix = min(100, round(weightedStdDev / 0.4 * 100))
```

Where 0.4 is the empirical upper bound for velocity standard deviation in typical NBA/CBB games.

#### Directional MVIX

Velocity series split into positive and negative components:

```
mvixUp  = min(100, round(RMS(positive velocities) / 0.4 * 100))
mvixDown = min(100, round(RMS(negative velocities) / 0.4 * 100))
bias = mvixUp - mvixDown
```

#### Inflection Magnitude

Average momentum change at each inflection type:

```
avgUpMagnitude = mean(|v[i] - v[i-1]|) for upward inflections
avgDownMagnitude = mean(|v[i] - v[i-1]|) for downward inflections
```

## Response Schema

```json
{
  "gameId": "401810829",
  "name": "Denver Nuggets at Los Angeles Lakers",
  "status": "STATUS_FINAL",
  "league": "NBA",
  "score": { "away": 125, "home": 127 },
  "away": {
    "team": "DEN",
    "current": {
      "momentum": 60,
      "velocity": 0,
      "acceleration": 0.001
    },
    "volatility": {
      "upInflections": 2,
      "downInflections": 7,
      "avgUpMagnitude": 10.5,
      "avgDownMagnitude": 3.57,
      "volatility": 0.0716,
      "mvix": 16,
      "mvixUp": 22,
      "mvixDown": 17,
      "bias": 5
    },
    "series": [ ... ],
    "inflections": [ ... ]
  },
  "home": { ... }
}
```

## Interpretation Guide

| MVIX Range | Interpretation |
|---|---|
| 0–30 | Steady — one team in control, few momentum swings |
| 30–70 | Moderate — normal game flow with typical swings |
| 70–100 | Highly volatile — chaotic game, frequent large swings |

| Bias | Interpretation |
|---|---|
| > 0 | Team's volatility trending favorable (momentum building) |
| 0 | Neutral — swings balanced in both directions |
| < 0 | Team's volatility trending unfavorable (momentum fading) |

## Predictive Analysis

### Dataset

- 182 valid NBA games over 4 weeks (Feb 15 – Mar 14, 2026)
- All-Star and special event games excluded
- Each game analyzed with per-team MVIX via the analysis endpoint

### Finding 1: Per-Game MVIX Does Not Predict Winners

No single MVIX metric exceeds ~54% accuracy when comparing the winner's value to the loser's within a single game. Cohen's d effect sizes are all below 0.07 — winner and loser profiles are statistically indistinguishable on a per-game basis.

| Metric (winner had higher) | Accuracy |
|---|---|
| mvix | 54.4% |
| mvixUp | 52.7% |
| upInflections | 49.7% |
| avgUpMagnitude | 48.4% |

**Conclusion:** Momentum volatility in a single game measures game texture, not outcome.

### Finding 2: Rolling MVIX Strongly Predicts Winners

When computing a team's average MVIX metrics over their prior N games, predictive accuracy increases dramatically with window size:

#### Lower rolling `avgUpMagnitude` (teams that don't need big momentum spikes)

| Window | Accuracy | Sample Size |
|---|---|---|
| 3-game | 57.5% | 134 games |
| 5-game | 50.0% | 102 games |
| 7-game | 61.1% | 72 games |
| 10-game | **73.1%** | 26 games |

#### Lower rolling `downInflections` (fewer momentum drops)

| Window | Accuracy | Sample Size |
|---|---|---|
| 3-game | 54.5% | 134 games |
| 5-game | 58.8% | 102 games |
| 7-game | **62.5%** | 72 games |
| 10-game | **63.5%** | 26 games |

#### Lower rolling `upInflections` (fewer upward swings = more controlled)

| Window | Accuracy | Sample Size |
|---|---|---|
| 3-game | 48.1% | 134 games |
| 5-game | **59.3%** | 102 games |
| 7-game | 56.9% | 72 games |
| 10-game | **65.4%** | 26 games |

#### Composite: "Calm" score (-mvix - avgUpMagnitude)

| Window | Accuracy | Sample Size |
|---|---|---|
| 3-game | 54.5% | 134 games |
| 5-game | 55.9% | 102 games |
| 7-game | **59.7%** | 72 games |
| 10-game | 57.7% | 26 games |

#### Baseline: Rolling win rate

| Window | Accuracy | Sample Size |
|---|---|---|
| 3-game | 64.6% | 134 games |
| 5-game | 70.1% | 102 games |
| 7-game | 68.8% | 72 games |
| 10-game | **73.1%** | 26 games |

### Finding 3: The Narrative

**Winning teams play steady basketball.** They don't need dramatic momentum surges — they execute consistently, resulting in:
- Lower `avgUpMagnitude` (smaller, steadier positive swings)
- Fewer total inflections (both up and down)
- Lower overall MVIX (less chaotic momentum profile)

**Losing teams swing wildly.** They have larger but rarer surges ("desperation runs"), more inflection points, and higher volatility — a pattern of inconsistency.

The 10-game rolling `avgUpMagnitude` matches actual win-rate as a predictor at 73.1%, meaning **momentum texture over a 10-game window encodes team quality as well as win/loss record does.**

### Caveats

- 10-game rolling window has only 26 qualifying games in this 4-week sample — needs more data to confirm
- Analysis does not account for strength of schedule, home/away splits, or rest days
- MVIX is derived from the same momentum engine weights for all analysis — changing weights would change results
- NBA-specific normalization (wider raw range) may affect cross-league comparisons

### Next Steps

- Backfill analysis across a full NBA season for larger sample size
- Test whether MVIX adds predictive value on top of point spreads or Elo ratings
- Explore in-game rolling MVIX as a live betting signal
- Consider team-matchup-specific MVIX interactions
