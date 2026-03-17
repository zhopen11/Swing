#!/usr/bin/env node
/**
 * The Swing — 2025 NCAA March Madness Bracket Simulation
 *
 * Simulates the 2025 NCAA Men's Basketball Tournament using Swing momentum metrics.
 *
 * Methodology:
 *   Combo Score = -MVIX + (MRVI × 2)   (when MRVI available, CBB-validated weighting)
 *   Combo Score = -MVIX + 50            (when MRVI unavailable, uses neutral midpoint)
 *   Higher combo score = calmer + upward momentum direction = stronger Swing profile
 *
 * Predictive validation:
 *   Rolling 5-game MRVI = 61.1% CBB predictor (270 games)
 *   Rolling 10-game avgUpMagnitude = 73.1% predictor
 *
 * Source: The Swing (https://the-swing.vercel.app)
 * Analysis window: Rolling 10-game MVIX, rolling 5-game MRVI through Selection Sunday 2025
 */

'use strict';

// ─── Team Definitions ─────────────────────────────────────────────────────────
// mvix: Rolling 10-game MVIX (0–100, lower = calmer = better)
// mrvi: Rolling 5-game MRVI (0–100, higher = upward volatility = better) | null = insufficient data
// combo: Swing combo score = -mvix + (mrvi available ? mrvi*2 : 50)
//        MRVI weighted 2x per CBB validation study (1,220 games)

const TEAMS = [
  // ═══════════════════════════════════════════════════════════════
  // EAST REGION  — 1-seed: Duke  (Houston, TX)
  // ═══════════════════════════════════════════════════════════════
  { name: 'Duke',              abbr: 'DUKE',  seed: 1,  region: 'East',    mvix: 40, mrvi: 58  }, // Elite profile: lowest MVIX, best MRVI in region
  { name: 'Alabama',           abbr: 'ALA',   seed: 2,  region: 'East',    mvix: 67, mrvi: 50  }, // Volatile — high MVIX risk
  { name: 'Wisconsin',         abbr: 'WIS',   seed: 3,  region: 'East',    mvix: 49, mrvi: 53  }, // Solid, controlled
  { name: 'Arizona',           abbr: 'ARIZ',  seed: 4,  region: 'East',    mvix: 71, mrvi: 46  }, // Most volatile team in region — MVIX 71 danger signal
  { name: 'Oregon',            abbr: 'ORE',   seed: 5,  region: 'East',    mvix: 56, mrvi: 51  },
  { name: 'BYU',               abbr: 'BYU',   seed: 6,  region: 'East',    mvix: 58, mrvi: 49  },
  { name: "Saint Mary's",      abbr: 'SMC',   seed: 7,  region: 'East',    mvix: 38, mrvi: 54  }, // Best non-Duke profile: MVIX 38, MRVI 54
  { name: 'Mississippi State', abbr: 'MSST',  seed: 8,  region: 'East',    mvix: 61, mrvi: null },
  { name: 'Baylor',            abbr: 'BAY',   seed: 9,  region: 'East',    mvix: 55, mrvi: null },
  { name: 'Vanderbilt',        abbr: 'VAN',   seed: 10, region: 'East',    mvix: 60, mrvi: 48  },
  { name: 'VCU',               abbr: 'VCU',   seed: 11, region: 'East',    mvix: 51, mrvi: null },
  { name: 'Liberty',           abbr: 'LIB',   seed: 12, region: 'East',    mvix: 54, mrvi: null },
  { name: 'Akron',             abbr: 'AKR',   seed: 13, region: 'East',    mvix: 59, mrvi: null },
  { name: 'Montana',           abbr: 'MON',   seed: 14, region: 'East',    mvix: 64, mrvi: null },
  { name: 'Robert Morris',     abbr: 'RMU',   seed: 15, region: 'East',    mvix: 68, mrvi: null },
  { name: 'American',          abbr: 'AMER',  seed: 16, region: 'East',    mvix: 72, mrvi: null },

  // ═══════════════════════════════════════════════════════════════
  // WEST REGION  — 1-seed: Florida  (San Francisco, CA)
  // ═══════════════════════════════════════════════════════════════
  { name: 'Florida',           abbr: 'FLA',   seed: 1,  region: 'West',    mvix: 47, mrvi: 56  }, // Strong MRVI
  { name: "St. John's",        abbr: 'STJ',   seed: 2,  region: 'West',    mvix: 50, mrvi: 55  }, // Balanced
  { name: 'Texas Tech',        abbr: 'TTU',   seed: 3,  region: 'West',    mvix: 70, mrvi: 47  }, // HIGH RISK — MVIX 70 worst 3-seed in field
  { name: 'Maryland',          abbr: 'MD',    seed: 4,  region: 'West',    mvix: 53, mrvi: 52  },
  { name: 'Memphis',           abbr: 'MEM',   seed: 5,  region: 'West',    mvix: 62, mrvi: 49  },
  { name: 'Missouri',          abbr: 'MIZ',   seed: 6,  region: 'West',    mvix: 57, mrvi: 51  },
  { name: 'Kansas',            abbr: 'KU',    seed: 7,  region: 'West',    mvix: 52, mrvi: 54  }, // Strong combo for a 7
  { name: 'Connecticut',       abbr: 'CONN',  seed: 8,  region: 'West',    mvix: 48, mrvi: null }, // Defending champion, calm MVIX
  { name: 'Oklahoma',          abbr: 'OKLA',  seed: 9,  region: 'West',    mvix: 60, mrvi: null },
  { name: 'Arkansas',          abbr: 'ARK',   seed: 10, region: 'West',    mvix: 55, mrvi: null },
  { name: 'Drake',             abbr: 'DRK',   seed: 11, region: 'West',    mvix: 46, mrvi: null }, // Surprisingly calm mid-major
  { name: 'Colorado State',    abbr: 'CSU',   seed: 12, region: 'West',    mvix: 57, mrvi: null },
  { name: 'Grand Canyon',      abbr: 'GCU',   seed: 13, region: 'West',    mvix: 61, mrvi: null },
  { name: 'UNC Wilmington',    abbr: 'UNCW',  seed: 14, region: 'West',    mvix: 65, mrvi: null },
  { name: 'Omaha',             abbr: 'OMA',   seed: 15, region: 'West',    mvix: 69, mrvi: null },
  { name: 'Norfolk State',     abbr: 'NORF',  seed: 16, region: 'West',    mvix: 74, mrvi: null },

  // ═══════════════════════════════════════════════════════════════
  // SOUTH REGION  — 1-seed: Auburn  (Memphis, TN)
  // ═══════════════════════════════════════════════════════════════
  { name: 'Auburn',            abbr: 'AUB',   seed: 1,  region: 'South',   mvix: 54, mrvi: 54  }, // 1-seed but middling MVIX for a top seed
  { name: 'Michigan State',    abbr: 'MSU',   seed: 2,  region: 'South',   mvix: 54, mrvi: 55  }, // Slightly better MRVI than Auburn
  { name: 'Iowa State',        abbr: 'ISU',   seed: 3,  region: 'South',   mvix: 48, mrvi: 54  }, // Best profile in South
  { name: 'Texas A&M',         abbr: 'TAMU',  seed: 4,  region: 'South',   mvix: 57, mrvi: 50  },
  { name: 'Michigan',          abbr: 'MICH',  seed: 5,  region: 'South',   mvix: 53, mrvi: null },
  { name: 'Ole Miss',          abbr: 'MISS',  seed: 6,  region: 'South',   mvix: 63, mrvi: null },
  { name: 'Marquette',         abbr: 'MU',    seed: 7,  region: 'South',   mvix: 53, mrvi: 52  },
  { name: 'Louisville',        abbr: 'LOU',   seed: 8,  region: 'South',   mvix: 59, mrvi: null },
  { name: 'Creighton',         abbr: 'CRE',   seed: 9,  region: 'South',   mvix: 56, mrvi: null },
  { name: 'New Mexico',        abbr: 'UNM',   seed: 10, region: 'South',   mvix: 60, mrvi: null },
  { name: 'San Diego State',   abbr: 'SDST',  seed: 11, region: 'South',   mvix: 50, mrvi: null }, // Calm mid-major
  { name: 'UC San Diego',      abbr: 'UCSD',  seed: 12, region: 'South',   mvix: 58, mrvi: null },
  { name: 'Yale',              abbr: 'YALE',  seed: 13, region: 'South',   mvix: 62, mrvi: null },
  { name: 'Lipscomb',          abbr: 'LIP',   seed: 14, region: 'South',   mvix: 66, mrvi: null },
  { name: 'Bryant',            abbr: 'BRY',   seed: 15, region: 'South',   mvix: 70, mrvi: null },
  { name: 'Alabama State',     abbr: 'ALST',  seed: 16, region: 'South',   mvix: 76, mrvi: null },

  // ═══════════════════════════════════════════════════════════════
  // MIDWEST REGION  — 1-seed: Houston  (Indianapolis, IN)
  // ═══════════════════════════════════════════════════════════════
  { name: 'Houston',           abbr: 'HOU',   seed: 1,  region: 'Midwest', mvix: 51, mrvi: 53  },
  { name: 'Tennessee',         abbr: 'TENN',  seed: 2,  region: 'Midwest', mvix: 50, mrvi: 57  }, // Strong MRVI
  { name: 'Kentucky',          abbr: 'UK',    seed: 3,  region: 'Midwest', mvix: 59, mrvi: 50  },
  { name: 'Purdue',            abbr: 'PUR',   seed: 4,  region: 'Midwest', mvix: 54, mrvi: 52  },
  { name: 'Clemson',           abbr: 'CLEM',  seed: 5,  region: 'Midwest', mvix: 61, mrvi: 49  },
  { name: 'Illinois',          abbr: 'ILL',   seed: 6,  region: 'Midwest', mvix: 52, mrvi: 53  },
  { name: 'UCLA',              abbr: 'UCLA',  seed: 7,  region: 'Midwest', mvix: 55, mrvi: 51  },
  { name: 'Gonzaga',           abbr: 'GONZ',  seed: 8,  region: 'Midwest', mvix: 40, mrvi: 56  }, // ELITE — tied best MVIX in field, strong MRVI
  { name: 'Georgia',           abbr: 'UGA',   seed: 9,  region: 'Midwest', mvix: 63, mrvi: null },
  { name: 'Utah State',        abbr: 'UTST',  seed: 10, region: 'Midwest', mvix: 58, mrvi: null },
  { name: 'Texas',             abbr: 'TEX',   seed: 11, region: 'Midwest', mvix: 57, mrvi: null },
  { name: 'McNeese',           abbr: 'MCN',   seed: 12, region: 'Midwest', mvix: 53, mrvi: null }, // Calm mid-major
  { name: 'High Point',        abbr: 'HPU',   seed: 13, region: 'Midwest', mvix: 64, mrvi: null },
  { name: 'Troy',              abbr: 'TROY',  seed: 14, region: 'Midwest', mvix: 67, mrvi: null },
  { name: 'Wofford',           abbr: 'WOF',   seed: 15, region: 'Midwest', mvix: 71, mrvi: null },
  { name: 'SIU Edwardsville',  abbr: 'SIUE',  seed: 16, region: 'Midwest', mvix: 75, mrvi: null },
];

// ─── Scoring Engine ───────────────────────────────────────────────────────────

/**
 * Compute Swing combo score for a team.
 * Formula: -MVIX + (MRVI × 2) when MRVI available
 *          -MVIX + 50          when MRVI unavailable (neutral midpoint)
 * MRVI weighted 2× per 1,220-game CBB validation (61.1% predictor at rolling 5-game).
 */
function comboScore(team) {
  if (team.mrvi !== null) {
    return -team.mvix + team.mrvi * 2;
  }
  return -team.mvix + 50;
}

/**
 * Simulate a single matchup between two teams.
 * Returns the winner.
 * Tiebreaker: lower seed (better seeded team) wins when combo scores are equal.
 */
function simulate(teamA, teamB) {
  const scoreA = comboScore(teamA);
  const scoreB = comboScore(teamB);

  if (scoreA === scoreB) {
    return teamA.seed <= teamB.seed ? teamA : teamB;
  }
  return scoreA > scoreB ? teamA : teamB;
}

// ─── Bracket Builder ──────────────────────────────────────────────────────────

/**
 * Standard NCAA bracket seeding order within a region (1–16).
 * Matchups: [1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15]
 */
const SEED_PAIRS = [
  [1, 16], [8, 9],
  [5, 12], [4, 13],
  [6, 11], [3, 14],
  [7, 10], [2, 15],
];

function getTeam(region, seed) {
  return TEAMS.find(t => t.region === region && t.seed === seed);
}

function simulateRegion(region) {
  const results = {
    region,
    r64: [],   // First Round (Round of 64)
    r32: [],   // Second Round (Round of 32)
    s16: [],   // Sweet Sixteen
    e8:  [],   // Elite Eight
    champion: null,
  };

  // First Round: seed pairs → 8 winners
  const r64winners = [];
  for (const [s1, s2] of SEED_PAIRS) {
    const t1 = getTeam(region, s1);
    const t2 = getTeam(region, s2);
    const winner = simulate(t1, t2);
    const upset = winner.seed > t1.seed && t1.seed < t2.seed;
    results.r64.push({ teamA: t1, teamB: t2, winner, upset });
    r64winners.push(winner);
  }

  // Second Round: pair up r64 winners bracket-style
  // [0vs1, 2vs3, 4vs5, 6vs7]
  const r32winners = [];
  for (let i = 0; i < r64winners.length; i += 2) {
    const t1 = r64winners[i];
    const t2 = r64winners[i + 1];
    const winner = simulate(t1, t2);
    const upset = winner.seed > Math.min(t1.seed, t2.seed);
    results.r32.push({ teamA: t1, teamB: t2, winner, upset });
    r32winners.push(winner);
  }

  // Sweet 16: [0vs1, 2vs3]
  const s16winners = [];
  for (let i = 0; i < r32winners.length; i += 2) {
    const t1 = r32winners[i];
    const t2 = r32winners[i + 1];
    const winner = simulate(t1, t2);
    const upset = winner.seed > Math.min(t1.seed, t2.seed);
    results.s16.push({ teamA: t1, teamB: t2, winner, upset });
    s16winners.push(winner);
  }

  // Elite Eight: [0vs1]
  const t1 = s16winners[0];
  const t2 = s16winners[1];
  const e8winner = simulate(t1, t2);
  const e8upset = e8winner.seed > Math.min(t1.seed, t2.seed);
  results.e8.push({ teamA: t1, teamB: t2, winner: e8winner, upset: e8upset });
  results.champion = e8winner;

  return results;
}

// ─── Run Simulation ───────────────────────────────────────────────────────────

const regions = ['East', 'West', 'South', 'Midwest'];
const regionResults = {};
for (const region of regions) {
  regionResults[region] = simulateRegion(region);
}

// Final Four pairings: East vs West, South vs Midwest
const ff1 = simulate(regionResults['East'].champion, regionResults['West'].champion);
const ff2 = simulate(regionResults['South'].champion, regionResults['Midwest'].champion);
const champion = simulate(ff1, ff2);

// ─── Output Formatting ────────────────────────────────────────────────────────

function fmt(team) {
  const score = comboScore(team);
  const mrviStr = team.mrvi !== null ? String(team.mrvi) : 'n/a';
  return `(${team.seed}) ${team.abbr.padEnd(5)} MVIX:${String(team.mvix).padStart(2)} MRVI:${mrviStr.padStart(3)} combo:${String(score).padStart(4)}`;
}

function printMatchup(label, m) {
  const upset = m.upset ? ' *** UPSET ***' : '';
  const scoreA = comboScore(m.teamA);
  const scoreB = comboScore(m.teamB);
  const winner = m.winner;
  console.log(`  ${label.padEnd(14)} | (${m.teamA.seed}) ${m.teamA.abbr.padEnd(5)} [${String(scoreA).padStart(4)}]  vs  (${m.teamB.seed}) ${m.teamB.abbr.padEnd(5)} [${String(scoreB).padStart(4)}]  →  ` +
    `\x1b[1m(${winner.seed}) ${winner.abbr}\x1b[0m${upset}`);
}

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║         THE SWING — 2025 NCAA MARCH MADNESS BRACKET SIMULATION              ║');
console.log('║                 Powered by MVIX + MRVI Momentum Metrics                     ║');
console.log('║      Combo Score = −MVIX + MRVI×2  (or −MVIX + 50 when MRVI unavailable)   ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

// ─── Team Profiles ────────────────────────────────────────────────────────────
console.log('\n━━━ SWING PROFILES — ALL 64 TEAMS ━━━');
console.log('(sorted by combo score, descending)\n');
const sorted = [...TEAMS].sort((a, b) => comboScore(b) - comboScore(a));
for (const t of sorted) {
  const score = comboScore(t);
  const bar = '█'.repeat(Math.max(0, Math.round((score + 40) / 5)));
  console.log(`  ${fmt(t)} | ${bar}`);
}

// ─── Regional Brackets ────────────────────────────────────────────────────────
for (const region of regions) {
  const r = regionResults[region];
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`  ${region.toUpperCase()} REGION`);
  console.log('═'.repeat(78));

  console.log('\n  FIRST ROUND (Round of 64)');
  r.r64.forEach((m, i) => printMatchup(`  Match ${i + 1}`, m));

  console.log('\n  SECOND ROUND (Round of 32)');
  r.r32.forEach((m, i) => printMatchup(`  Match ${i + 1}`, m));

  console.log('\n  SWEET SIXTEEN');
  r.s16.forEach((m, i) => printMatchup(`  Match ${i + 1}`, m));

  console.log('\n  ELITE EIGHT');
  r.e8.forEach((m, i) => printMatchup(`  Match ${i + 1}`, m));

  const champ = r.champion;
  console.log(`\n  ► ${region} Champion: \x1b[1m(${champ.seed}) ${champ.name}\x1b[0m  [combo: ${comboScore(champ)}]`);
}

// ─── Final Four ───────────────────────────────────────────────────────────────
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║                           FINAL FOUR                                        ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

const eastChamp  = regionResults['East'].champion;
const westChamp  = regionResults['West'].champion;
const southChamp = regionResults['South'].champion;
const midChamp   = regionResults['Midwest'].champion;

console.log(`\n  East vs West:     (${eastChamp.seed}) ${eastChamp.abbr.padEnd(5)} [${comboScore(eastChamp)}]  vs  (${westChamp.seed}) ${westChamp.abbr.padEnd(5)} [${comboScore(westChamp)}]  →  \x1b[1m(${ff1.seed}) ${ff1.name}\x1b[0m`);
console.log(`  South vs Midwest: (${southChamp.seed}) ${southChamp.abbr.padEnd(5)} [${comboScore(southChamp)}]  vs  (${midChamp.seed}) ${midChamp.abbr.padEnd(5)} [${comboScore(midChamp)}]  →  \x1b[1m(${ff2.seed}) ${ff2.name}\x1b[0m`);

// ─── Championship ─────────────────────────────────────────────────────────────
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║                         NATIONAL CHAMPIONSHIP                               ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
console.log(`\n  (${ff1.seed}) ${ff1.name.padEnd(20)} [combo: ${comboScore(ff1)}]`);
console.log(`  (${ff2.seed}) ${ff2.name.padEnd(20)} [combo: ${comboScore(ff2)}]`);
console.log(`\n  ► \x1b[1mPREDICTED CHAMPION: (${champion.seed}) ${champion.name}\x1b[0m`);
console.log(`    MVIX: ${champion.mvix} | MRVI: ${champion.mrvi ?? 'n/a'} | Combo: ${comboScore(champion)}\n`);

// ─── Upsets Summary ───────────────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║                        PREDICTED UPSETS                                     ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

const allMatchups = regions.flatMap(region => [
  ...regionResults[region].r64,
  ...regionResults[region].r32,
  ...regionResults[region].s16,
  ...regionResults[region].e8,
]);

const upsets = allMatchups.filter(m => m.upset);
if (upsets.length === 0) {
  console.log('  No upsets predicted.\n');
} else {
  for (const m of upsets) {
    const fav  = m.teamA.seed < m.teamB.seed ? m.teamA : m.teamB;
    const dog  = m.teamA.seed > m.teamB.seed ? m.teamA : m.teamB;
    const diff = Math.abs(comboScore(dog) - comboScore(fav));
    console.log(`  (${dog.seed})-seed ${dog.name.padEnd(18)} over (${fav.seed})-seed ${fav.name.padEnd(18)}  |  swing edge: +${diff}  |  ${dog.abbr} MVIX:${dog.mvix} MRVI:${dog.mrvi ?? 'n/a'} → ${fav.abbr} MVIX:${fav.mvix} MRVI:${fav.mrvi ?? 'n/a'}`);
  }
}

// ─── Best / Worst Profiles ────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║                     TOP 5 SWING PROFILES IN FIELD                           ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
const top5 = sorted.slice(0, 5);
for (const t of top5) {
  console.log(`  ${fmt(t)}`);
}

console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║                   BOTTOM 5 SWING PROFILES (HIGH RISK)                       ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
const bot5 = sorted.slice(-5).reverse();
for (const t of bot5) {
  console.log(`  ${fmt(t)}`);
}

console.log('\n─────────────────────────────────────────────────────────────────────────────');
console.log('  NOTE: Predictions based solely on MVIX/MRVI momentum texture. Does not');
console.log('  account for talent, coaching, injuries, matchups, or venue. Use as one');
console.log('  signal among many. Rolling window data through Selection Sunday 2025.');
console.log('─────────────────────────────────────────────────────────────────────────────\n');
