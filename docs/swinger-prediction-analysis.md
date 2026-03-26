# Swinger Prediction Analysis: Pregame vs Live

## Overview

Analysis of how well team Swinger totals predict game outcomes, comparing pregame historical swingers against live in-game swingers. Based on 32 CBB games from March 19-20, 2026.

## Methodology

- **Pregame Swingers**: Top 3 players per team ranked by conference-adjusted avg weighted impact from all prior games (excluding current game)
- **Live Swingers**: Top 3 players per team ranked by magnitude-weighted swing impact during the current game
- **Prediction**: The team with the higher combined swinger total is predicted to win
- **Margin**: Absolute difference between team swinger totals

## Results

### Overall Accuracy

| Predictor | Correct | Accuracy |
|-----------|---------|----------|
| **Pregame Swingers** | 22/32 | **68.8%** |
| **Live Swingers** | 22/32 | **68.8%** |

### High Margin Accuracy

| Predictor | Threshold | Correct | Accuracy |
|-----------|-----------|---------|----------|
| **Live Swingers** | margin > 100 | 19/23 | **82.6%** |
| **Pregame Swingers** | margin > 30 | 19/28 | **67.9%** |
| **Live Swingers** | margin ≤ 100 | 3/9 | 33.3% |

### Agreement Analysis

| Scenario | Games | Accuracy |
|----------|-------|----------|
| **Both agree on same team** | 22/32 | **77.3%** (17/22) |
| **Pregame & Live disagree** | 10/32 | 50/50 split |

## Key Findings

1. **Pregame swingers are equally predictive as live swingers overall (68.8%).** Historical player momentum data carries real signal about team quality — you don't need to wait for the game to start.

2. **Live swingers are more decisive at high margins.** When the live swinger gap exceeds 100 points, the leading team wins 82.6% of the time. This is the strongest single signal.

3. **When both indicators agree, accuracy jumps to 77.3%.** This combined signal is the most reliable predictor — worth surfacing as a feature on the game card.

4. **Close swinger margins are coin flips.** When the live margin is under 100, accuracy drops to 33.3%. The signal only works when the gap is significant.

5. **Pregame swingers catch what live misses and vice versa.** When they disagree (10 games), each won 5 — neither dominates when they conflict. This suggests they capture different aspects of team strength.

## Notable Games

### Strongest Predictions (Both Agree, Correct)
- **CBU vs KU**: Pre 221-379, Live 181-578 → KU wins 68-60
- **PV vs FLA**: Pre 179-407, Live 67-386 → FLA wins 114-55
- **PENN vs ILL**: Pre 233-304, Live 127-560 → ILL wins 105-70

### Biggest Misses
- **SLU vs UGA**: Both picked UGA (Pre 246-538, Live 352-494) → SLU wins 102-77
- **USU vs VILL**: Both picked Villanova (Pre 276-380, Live 226-406) → USU wins 86-76
- **SCU vs UK**: Both picked SCU/away (Pre 288-245, Live 574-511) → UK wins 89-84

### Interesting Disagreements
- **HPU vs WIS**: Pregame picked Wisconsin (169-466), Live picked High Point (519-278) → High Point wins 83-82. Live swingers captured the upset momentum.
- **MIZ vs MIA**: Pregame picked Miami (247-319), Live picked Missouri (602-308) → Miami wins 80-66. Pregame was right despite Missouri dominating swing plays.

## Implications for The Swing

1. **Pregame swinger comparison is a legitimate pregame edge** — 68.8% accuracy before the game even starts
2. **A "Both Agree" indicator on the game card** would be a high-value feature when both pregame and live swingers point the same way (77.3%)
3. **The live swinger margin threshold of 100** is a meaningful breakpoint — above it the signal is very strong (82.6%), below it the data is noise
4. **Swinger totals work best for identifying blowouts**, less so for close games

## Pregame Swingers Accuracy by Margin Size

Unlike live swingers which improve dramatically with larger margins, pregame swingers show a different pattern.

### By Margin Bucket

| Margin Range | Games | Correct | Accuracy |
|-------------|-------|---------|----------|
| 0-25 | 4 | 3 | 75% |
| 26-50 | 5 | 2 | 40% |
| 51-75 | 6 | 5 | **83.3%** |
| 76-100 | 2 | 2 | **100%** |
| 101-150 | 9 | 6 | 66.7% |
| 151-200 | 2 | 2 | **100%** |
| 200+ | 4 | 2 | 50% |

### Cumulative (margin >= threshold)

| Threshold | Games | Accuracy |
|-----------|-------|----------|
| >= 0 | 32 | 68.8% |
| >= 50 | 23 | **73.9%** |
| >= 75 | 17 | 70.6% |
| >= 100 | 15 | 66.7% |
| >= 200 | 4 | 50% |

### Pregame Margin Analysis

- **Sweet spot is 50-100 margin**: 87.5% accuracy (7/8 games). Large enough to indicate a real talent gap, small enough to avoid the upset-prone blowout mismatches.
- **Pregame accuracy doesn't scale with margin** the way live swingers do. It hovers around 67-74% regardless of gap size.
- **Very large pregame margins (200+) perform worst at 50%**. These represent heavy favorite vs underdog matchups — exactly the games where March Madness upsets happen. The two biggest misses (margins of 292 and 297) were both upsets: SLU over UGA and High Point over Wisconsin.
- **Pregame swingers measure roster quality**, not in-game execution. A team can have elite historical swingers and still lose if those players don't perform on the day.

### Comparison: Pregame vs Live Margin Scaling

| Predictor | Low Margin | Mid Margin | High Margin |
|-----------|-----------|------------|-------------|
| **Pregame** | 68.8% (all) | **87.5%** (50-100) | 50% (200+) |
| **Live** | 33.3% (≤100) | 68.8% (all) | **82.6%** (>100) |

The two predictors are complementary:
- **Pregame** is best at mid-range margins where there's a clear but not extreme talent gap
- **Live** is best at high margins where in-game momentum has decisively tilted
- Together when they agree: **77.3%** — the strongest combined signal

## Data

- **Period**: March 19-20, 2026
- **League**: NCAA Division I Men's Basketball (CBB)
- **Games**: 32 final games
- **Pregame data**: Conference-adjusted weighted impact from full 2025-26 season
- **Live data**: In-game weighted impact from play-by-play momentum analysis
