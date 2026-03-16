# Momentum Relative Volatility Index (MRVI) — Technical Specification

## Overview

MRVI is an adaptation of Donald Dorsey's Relative Volatility Index (RVI) for basketball momentum analysis. While MVIX measures the **magnitude** of momentum volatility ("how volatile is this team?"), MRVI measures the **direction** of volatility ("is volatility expanding upward or downward?"). Together they form a complete volatility picture.

## Origin: Dorsey RVI

The Relative Volatility Index was introduced by Donald Dorsey in 1Mo Technical Analysis of Stocks & Commodities (1993). Unlike RSI which uses absolute price changes, RVI uses standard deviation to measure the direction of volatility itself. It was designed as a confirming indicator — not to generate signals alone, but to validate signals from other indicators.

**Key insight applied to basketball:** A team can have high volatility (MVIX) that is working in their favor (high MRVI) or against them (low MRVI). The combination tells you whether chaos is an asset or a liability for that team in the current game.

## Algorithm

### Input

Per-team momentum chart data: an array of data points, each with:
- `v` — normalized momentum value (5–95 scale)
- `p` — period number
- `c` — game clock display value

### Parameters

| Parameter | Default | Description |
|---|---|---|
| `STD_PERIOD` | 8 | Rolling window for standard deviation calculation |
| `SMOOTH_PERIOD` | 14 | Wilder's exponential smoothing period |

### Step 1: Rolling Standard Deviation

For each chart point `i` (where `i >= STD_PERIOD`), compute the rolling standard deviation of the last `STD_PERIOD` momentum values:

```
values = [v[i-STD_PERIOD+1], v[i-STD_PERIOD+2], ..., v[i]]
mean = sum(values) / STD_PERIOD
stddev[i] = sqrt(sum((v - mean)^2 for v in values) / STD_PERIOD)
```

### Step 2: Classify Direction

For each point, classify the standard deviation as "up volatility" or "down volatility" based on whether momentum is rising or falling:

```
if v[i] > v[i-1]:
    up_vol[i] = stddev[i]
    down_vol[i] = 0
elif v[i] < v[i-1]:
    up_vol[i] = 0
    down_vol[i] = stddev[i]
else:
    // Tie — split evenly or carry forward prior classification
    up_vol[i] = stddev[i] / 2
    down_vol[i] = stddev[i] / 2
```

### Step 3: Wilder's Exponential Smoothing

Apply Wilder's smoothing (same as RSI) to both up and down volatility series:

```
alpha = 1 / SMOOTH_PERIOD

smoothed_up[0] = up_vol[0]
smoothed_down[0] = down_vol[0]

For i > 0:
    smoothed_up[i] = alpha * up_vol[i] + (1 - alpha) * smoothed_up[i-1]
    smoothed_down[i] = alpha * down_vol[i] + (1 - alpha) * smoothed_down[i-1]
```

Wilder's smoothing was chosen over simple moving average because it:
- Reacts faster to regime changes (important in a 40-minute basketball game)
- Gives more weight to recent data
- Is the standard for RSI-family indicators

### Step 4: Compute MRVI

```
MRVI[i] = 100 * smoothed_up[i] / (smoothed_up[i] + smoothed_down[i])
```

If `smoothed_up[i] + smoothed_down[i] == 0`, MRVI defaults to 50 (neutral).

## Interpretation

### MRVI Scale (0–100)

| MRVI Range | Interpretation |
|---|---|
| 75–100 | Strong upward volatility regime — momentum surges dominating |
| 50–75 | Upward bias — momentum trending favorably |
| 50 | Neutral — volatility balanced in both directions |
| 25–50 | Downward bias — momentum drops dominating |
| 0–25 | Strong downward volatility regime — team in sustained momentum collapse |

### Signal Patterns

**Centerline Crossover (MRVI crossing 50):**
- Crossing above 50: Volatility regime shifting to favor the team — momentum surges are becoming larger/more frequent than drops
- Crossing below 50: Volatility regime shifting against the team — momentum is deteriorating

**Divergence:**
- Score rising but MRVI falling: The lead may be fragile — the team is winning on the scoreboard but their momentum dynamics are degrading
- Score falling but MRVI rising: Potential comeback — despite trailing, the team's momentum volatility is shifting in their favor

**Extreme Readings:**
- MRVI > 80: Strong positive regime, but may be unsustainable (like overbought RSI)
- MRVI < 20: Strong negative regime, but may be approaching a reversal point

## Combined MVIX + MRVI Framework

| MVIX | MRVI | Interpretation |
|---|---|---|
| Low (<30) | High (>60) | Calm and trending up — strongest position |
| Low (<30) | Low (<40) | Calm but trending down — controlled decline |
| High (>70) | High (>60) | Chaotic but momentum surges dominating — high-risk high-reward |
| High (>70) | Low (<40) | Chaotic and trending down — worst position, momentum collapse |
| Moderate | ~50 | Neutral — game is balanced, no clear volatility edge |

### Pre-Game Usage (Rolling MRVI)

Compute each team's average MRVI from their last N games:
- Rolling MRVI > 55: Team is in an upward volatility regime across recent games — their chaos tends to work in their favor
- Rolling MRVI < 45: Team is in a downward volatility regime — their volatility tends to hurt them
- Combined with rolling MVIX for full profile:
  - Low MVIX + High MRVI = controlled team trending up (best predictor per our research)
  - High MVIX + Low MRVI = volatile team trending down (worst profile)

### In-Game Usage

- Display MRVI as a real-time indicator on the game card
- Track centerline crossovers as potential momentum shift alerts
- Use MRVI divergence from score differential as a "fragile lead" or "hidden comeback" signal
- MRVI crossing below 30 could trigger a "momentum collapse" warning

## Relationship to Existing Alerts

MRVI can enhance the existing alert system:

| Existing Alert | MRVI Enhancement |
|---|---|
| **Bluffing** (score/momentum disagree) | MRVI direction confirms whether the disagreement is growing or resolving |
| **Comeback Watch** (trailing team leads momentum) | MRVI > 60 for trailing team = comeback gaining steam; MRVI falling = comeback fading |
| **Swing Warning** (close score, one-sided momentum) | MRVI trend shows if the momentum advantage is accelerating or stabilizing |

## Implementation Plan

### Phase 1: Core Computation
- Add `computeMRVI(chart, league)` function to `lib/mvix.js`
- Returns per-point MRVI series and current MRVI value
- Include in the analysis endpoint response

### Phase 2: Poll Integration
- Compute MRVI alongside MVIX in the poll route
- Attach `mrviAway` and `mrviHome` to game objects
- Store in `team_mvix` table (add `mrvi` column)

### Phase 3: Display
- Add MRVI to the game card (small gauge or number near MVIX meter)
- Include MRVI in chart click tooltips
- Color-code: green (>60), yellow (40-60), red (<40)

### Phase 4: Alerts
- MRVI centerline crossover as a new alert type
- Divergence detection (score vs MRVI direction mismatch)
- Combined MVIX+MRVI regime classification in analysis endpoint

## Validation Plan

Using the same 182-game NBA dataset from our MVIX analysis:

1. Compute per-game final MRVI for both teams
2. Test if lower/higher MRVI predicts winners (single game)
3. Compute rolling 3/5/7/10-game MRVI per team
4. Test rolling MRVI as a predictor
5. Test MVIX + MRVI combined as a predictor (e.g., low MVIX + high MRVI)
6. Compare prediction accuracy against MVIX alone, MRVI alone, and combined

### Expected Hypothesis

Based on Dorsey's original research and our MVIX findings:
- MRVI alone may be a moderate predictor (~55-60%)
- MRVI combined with MVIX should outperform either alone
- The strongest signal will be rolling low MVIX + rolling high MRVI (calm team with upward volatility trend)
- MRVI will be most valuable as an in-game indicator for detecting regime changes before they manifest in the score

## Empirical Results (40 Games, March 14-15, 2026)

MRVI was computed for all 40 final games (14 NBA, 26 CBB) from March 14-15, 2026 and compared against MVIX as a predictor of game outcomes.

### Overall Prediction Accuracy

| Metric | All (40 games) | NBA (14) | CBB (26) |
|---|---|---|---|
| Lower MVIX wins | **60.0%** | 57% | **62%** |
| Higher MRVI wins | 52.5% | 36% | **62%** |
| Lower avgUpMagnitude wins | **61.3%** | — | — |
| Combo (-mvix + mrvi) wins | 55.0% | 36% | **65%** |
| When MVIX + MRVI agree | **64.7%** | — | — |

### Winner vs Loser Average Profile

| Metric | Winner avg | Loser avg | Diff |
|---|---|---|---|
| MVIX | 39.4 | 40.8 | -1.5 |
| MRVI | 50.5 | 49.9 | +0.6 |

### Key Findings

1. **MVIX is the stronger standalone predictor** at 60% overall. MRVI alone is 52.5% — barely above coin flip.

2. **MRVI performs well in CBB but poorly in NBA.** In college basketball, MRVI matched MVIX at 62%. In NBA it was 36% — actively inversely correlated. NBA games may have too many momentum reversals for the Wilder smoothing to track meaningfully within a single game.

3. **The combo score (-mvix + mrvi) is the best CBB predictor at 65%.** A calm team (low MVIX) whose volatility trends upward (high MRVI) correctly picks CBB winners 2 out of 3 times.

4. **When MVIX and MRVI agree, accuracy jumps to 64.7%.** They only agreed in 17 of 40 games, but the convergence signal was stronger than either alone.

5. **Winner/loser MRVI profiles are nearly identical** (50.5 vs 49.9) — unlike MVIX where there's a clearer separation. MRVI does not separate winners from losers well on aggregate averages.

### Notable Game Results

| Game | Winner | W MVIX | W MRVI | L MVIX | L MRVI | MVIX | MRVI | Combo |
|---|---|---|---|---|---|---|---|---|
| CBB VAN vs ARK | ARK | 32 | 55.2 | 59 | 51.9 | ✓ | ✓ | ✓ |
| CBB PENN vs YALE | PENN | 29 | 48.7 | 36 | 52.7 | ✓ | ✗ | ✓ |
| CBB PUR vs UCLA | PUR | 60 | 46.1 | 100 | 37.7 | ✓ | ✓ | ✓ |
| NBA CHA vs SA | SA | 23 | 54.5 | 37 | 48.3 | ✓ | ✓ | ✓ |
| CBB HOU vs ARIZ | ARIZ | 100 | 33.1 | 85 | 55.3 | ✗ | ✗ | ✗ |

**VAN vs ARK** (from our case study): Both MVIX and MRVI correctly predicted ARK. Arkansas played calmer (MVIX 32 vs 59) with a favorable volatility direction (MRVI 55.2).

**PENN vs YALE** (tracked live): MVIX correctly predicted PENN, but MRVI pointed to YALE. The combo score still picked PENN correctly because the MVIX gap (29 vs 36) outweighed the MRVI gap.

**HOU vs ARIZ**: Both predictors failed. Arizona won despite having higher MVIX (100 vs 85) and lower MRVI (33.1 vs 55.3) — a case where the underdog overcame an unfavorable volatility profile.

### Initial Recommendation (40-game sample)

MRVI adds value as a **CBB-specific confirming indicator** alongside MVIX, not as a standalone predictor. For NBA, MVIX alone is more reliable. Implementation should prioritize:

1. **CBB combo score** (-mvix + mrvi) as the primary MRVI use case (65% accuracy)
2. **Convergence signal** — when both MVIX and MRVI agree, flag as high-confidence prediction
3. **NBA: deprioritize MRVI** — the 36% accuracy suggests the Dorsey smoothing parameters may need NBA-specific tuning, or the indicator is fundamentally less applicable to the faster, more talent-driven NBA game
4. **Further research needed** — 40 games is a small sample; backfill across a full season to validate these league-specific patterns

## Large-Scale Validation (1,220 CBB Games)

The initial 40-game findings were validated against 1,220 CBB games from a 30-day backfill. Results significantly revised some conclusions.

### Single-Game Prediction Accuracy

| Metric | Accuracy | Games |
|---|---|---|
| Higher MRVI wins | **54.3%** | 1220 |
| Higher Combo (-mvix+mrvi) wins | 52.0% | 1220 |
| Lower avgUpMagnitude wins | 50.7% | 1220 |
| Lower MVIX wins | 49.9% | 1220 |
| Lower abs(bias) wins | 48.4% | 1220 |
| When MVIX+MRVI agree | 53.7% | 601 |

### Winner vs Loser Profile

| Metric | Winner avg | Loser avg | Diff | Cohen's d |
|---|---|---|---|---|
| MVIX | 55.19 | 54.88 | +0.30 | 0.014 |
| MRVI | 49.47 | 48.88 | +0.59 | 0.085 |
| Combo | -5.72 | -6.01 | +0.29 | 0.013 |

### By Margin of Victory

| Margin | Lower MVIX | Higher MRVI | Higher Combo |
|---|---|---|---|
| Close (1-5 pts, 402 games) | 48% | 51% | 51% |
| Medium (6-15 pts, 549 games) | 51% | **56%** | 51% |
| Blowout (16+ pts, 269 games) | 51% | **56%** | **56%** |

### Key Revisions from 40-Game Findings

1. **MRVI is the best single-game CBB predictor at 54.3%**, confirmed at scale. This is statistically meaningful over 1,220 games.

2. **MVIX dropped to coin-flip (49.9%)** for single-game CBB prediction. The earlier 62% from 40 games was noise. Single-game MVIX does not predict CBB winners.

3. **The combo score underperforms MRVI alone (52.0% vs 54.3%).** Adding MVIX to MRVI dilutes the signal in CBB. Use MRVI standalone.

4. **MRVI is strongest in decisive games (56%)** — medium-margin and blowout games where one team clearly dominated. In close games it provides no edge.

## Rolling MRVI Analysis (CBB)

Tested rolling N-game averages of all metrics as pre-game predictors. Both teams must have at least N prior games with MRVI data to qualify.

### Rolling Window Results

| Metric | 1-game (1220) | 3-game (637) | 5-game (270) | 7-game (34) |
|---|---|---|---|---|
| **Higher MRVI** | **54.3%** | **53.5%** | **61.1%** | 52.9% |
| Lower MVIX | 49.9% | 49.5% | 47.2% | 38.2% |
| Lower avgUp | 50.7% | 49.5% | 47.0% | 58.8% |
| Higher Combo | 52.0% | 50.5% | 50.7% | 38.2% |

### Key Findings

1. **Rolling 5-game MRVI at 61.1% is the best CBB predictor found** (270 qualifying games). Teams with consistently favorable volatility direction over 5 games win 61% of the time.

2. **MRVI improves with rolling windows; MVIX does not.** MVIX actually gets worse at longer windows (47.2% at 5-game). In CBB, volatility magnitude is not predictive, but the direction of volatility is.

3. **The combo score does not help in CBB at any window.** Adding MVIX to MRVI dilutes the signal consistently. For CBB, MRVI should be used standalone.

4. **10-game window had 0 qualifying games** — 30 days of data is insufficient for most CBB teams to accumulate 10 games with MRVI. A full-season backfill would enable this analysis.

5. **MRVI follows the same scaling pattern as NBA MVIX** — longer rolling windows produce stronger signals. At 5 games it's 61.1%; at 10 games it could be even higher.

### League-Specific Recommendation (Revised)

| League | Best Single-Game Metric | Best Rolling Metric | Recommended Display |
|---|---|---|---|
| **CBB** | MRVI (54.3%) | Rolling 5-game MRVI (61.1%) | Rolling 5-game MRVI |
| **NBA** | MVIX (54.4%*) | Rolling 10-game avgUpMagnitude (73.1%*) | Rolling 10-game MVIX |

*From 182-game NBA analysis (see MVIX-Analysis.md)

The two leagues respond to fundamentally different momentum metrics:
- **CBB**: Volatility *direction* matters (MRVI). College teams that consistently channel their volatility upward are better teams.
- **NBA**: Volatility *magnitude* matters (MVIX). NBA teams that play with less volatility are better teams.

This likely reflects the difference in talent distribution: CBB has wider talent gaps, so momentum direction reflects team quality. NBA is more talent-equalized, so controlled play (low volatility) separates winners.

## References

- Dorsey, D. (1993). "The Relative Volatility Index." Technical Analysis of Stocks & Commodities.
- Wilder, J.W. (1978). "New Concepts in Technical Trading Systems." — Wilder's smoothing method.
- The Swing MVIX Analysis (docs/MVIX-Analysis.md) — foundational volatility research this builds upon.
