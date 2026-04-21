// app/scripts/sr-nhl-validate.js
// Usage: node app/scripts/sr-nhl-validate.js
//        node app/scripts/sr-nhl-validate.js --game <id>   (single game debug)

const fs   = require('fs');
const path = require('path');
const {
  parseZonePossessions, scoreZoneSequence,
  computeZoneMomentum, detectAlerts,
} = require('../lib/sr-nhl-possession');

const CACHE_DIR = path.join(__dirname, '../../data/sr-nhl-cache');

// ── Baseline model: raw shot count over last 10 shot events per team ─────────
function baselineMomentum(events, homeId, awayId) {
  const SHOT_TYPES = new Set(['goal', 'shotsaved', 'shotmissed']);
  const shotEvents = events.filter(e => SHOT_TYPES.has(e.event_type));
  const recent = shotEvents.slice(-10);
  let home = 0, away = 0;
  for (const ev of recent) {
    const id = ev.attribution?.id;
    if (id === homeId) home++;
    else if (id === awayId) away++;
  }
  const total = home + away;
  if (total === 0) return { home: 50, away: 50 };
  return { home: Math.round((home / total) * 100), away: Math.round((away / total) * 100) };
}

// ── Score state from events ───────────────────────────────────────────────────
function getScore(ev) {
  return { home: ev.home_points ?? 0, away: ev.away_points ?? 0 };
}

// ── Flatten all events from PBP ───────────────────────────────────────────────
function flattenEvents(pbp) {
  return (pbp.periods || []).flatMap(p =>
    (p.events || []).map(e => ({ ...e, period: e.period ?? p.number ?? p.sequence }))
  );
}

// ── Find comeback scenarios in a game ─────────────────────────────────────────
function findComebacks(events, homeId, awayId) {
  const FILTER = new Set(['substitution', 'gamesetup', 'challenge']);
  const filtered = events.filter(e => !FILTER.has(e.event_type));
  const comebacks = [];

  for (let i = 0; i < filtered.length; i++) {
    const ev = filtered[i];
    const score = getScore(ev);
    const diff = score.home - score.away;

    // Must be period 2 or 3 (2nd half equivalent)
    if ((ev.period || 1) < 2) continue;

    // Trailing team down ≥2 goals
    if (Math.abs(diff) < 2) continue;

    const trailingTeam = diff > 0 ? awayId : homeId;
    const trailingGoals = diff > 0 ? score.away : score.home;
    const leadingGoals  = diff > 0 ? score.home : score.away;

    // Look ahead 60 events for ≥1 goal closure
    const lookahead = filtered.slice(i + 1, i + 61);
    let closed = false;
    for (const fev of lookahead) {
      const fs = getScore(fev);
      const newTrailing = trailingTeam === homeId ? fs.home : fs.away;
      const newLeading  = trailingTeam === homeId ? fs.away : fs.home;
      if (newLeading - newTrailing < leadingGoals - trailingGoals) {
        closed = true;
        break;
      }
    }

    if (closed) {
      comebacks.push({ eventIdx: i, trailingTeam, scoreDiff: Math.abs(diff), event: ev });
      i += 30; // skip forward to avoid overlapping scenarios
    }
  }

  return comebacks;
}

// ── Check if model fires CW alert at or before a comeback scenario ────────────
function modelCatchesComebacks(events, comebacks, homeId, awayId, useBaseline) {
  const FILTER = new Set(['substitution', 'gamesetup', 'challenge']);
  const filtered = events.filter(e => !FILTER.has(e.event_type));
  const results = [];

  for (const cb of comebacks) {
    const scanEnd = cb.eventIdx;
    const scanStart = Math.max(0, scanEnd - 120);
    let caughtAt = null;

    for (let i = scanStart; i <= scanEnd; i++) {
      const slice = filtered.slice(0, i + 1);
      const score = getScore(filtered[i]);
      let mom;
      if (useBaseline) {
        mom = baselineMomentum(slice, homeId, awayId);
      } else {
        const seqs = parseZonePossessions(slice);
        const scored = seqs.map(s => ({ ...s, ...scoreZoneSequence(s) }));
        mom = computeZoneMomentum(homeId, awayId, scored);
      }

      // Use the current event's strength field as the best available approximation
      // (SR attributes strength relative to the event's team; 'even' is the fallback)
      const evStrength = filtered[i].strength || 'even';
      const homeStrength = evStrength;
      const awayStrength = evStrength;
      const alerts = detectAlerts(mom.home, mom.away, score.home, score.away, homeStrength, awayStrength);
      if (alerts.some(a => a.type === 'CW')) {
        caughtAt = i;
        break;
      }
    }

    results.push({ ...cb, caught: caughtAt !== null, caughtAtIdx: caughtAt });
  }

  return results;
}

// ── Alert precision: of CW/SIB alerts fired, what % confirm within 50 events ──
function computeAlertPrecision(events, homeId, awayId, useBaseline) {
  const FILTER = new Set(['substitution', 'gamesetup', 'challenge']);
  const filtered = events.filter(e => !FILTER.has(e.event_type));
  let fired = 0, confirmed = 0;

  for (let i = 0; i < filtered.length; i++) {
    const score = getScore(filtered[i]);
    const diff = Math.abs(score.home - score.away);
    if (diff < 2) continue; // need ≥2 goal gap for CW

    let mom;
    if (useBaseline) {
      mom = baselineMomentum(filtered.slice(0, i + 1), homeId, awayId);
    } else {
      const seqs = parseZonePossessions(filtered.slice(0, i + 1));
      const scored = seqs.map(s => ({ ...s, ...scoreZoneSequence(s) }));
      mom = computeZoneMomentum(homeId, awayId, scored);
    }

    const evStrength = filtered[i].strength || 'even';
    const alerts = detectAlerts(mom.home, mom.away, score.home, score.away, evStrength, evStrength);
    if (!alerts.some(a => a.type === 'CW' || a.type === 'SIB')) continue;

    fired++;
    // Confirmed if score gap narrows ≥1 goal within next 50 events
    const leadingGoals  = Math.max(score.home, score.away);
    const trailingGoals = Math.min(score.home, score.away);
    const lookahead = filtered.slice(i + 1, i + 51);
    for (const fev of lookahead) {
      const fs = getScore(fev);
      const newLead = Math.max(fs.home, fs.away) - Math.min(fs.home, fs.away);
      if (newLead < leadingGoals - trailingGoals) { confirmed++; break; }
    }

    i += 10; // skip forward to avoid counting the same alert run repeatedly
  }

  return { fired, confirmed };
}

// ── Per-game analysis ─────────────────────────────────────────────────────────
function analyzeGame(pbp) {
  const homeId = pbp.home.id;
  const awayId = pbp.away.id;
  const home = pbp.home.alias || pbp.home.name;
  const away = pbp.away.alias || pbp.away.name;

  const events = flattenEvents(pbp);
  const comebacks = findComebacks(events, homeId, awayId);

  const possResults = modelCatchesComebacks(events, comebacks, homeId, awayId, false);
  const baseResults = modelCatchesComebacks(events, comebacks, homeId, awayId, true);
  const possPrecision = computeAlertPrecision(events, homeId, awayId, false);
  const basePrecision = computeAlertPrecision(events, homeId, awayId, true);

  let possFirst = 0, baseFirst = 0, same = 0;
  for (let i = 0; i < comebacks.length; i++) {
    const p = possResults[i];
    const b = baseResults[i];
    if (p.caught && b.caught) {
      if (p.caughtAtIdx < b.caughtAtIdx) possFirst++;
      else if (b.caughtAtIdx < p.caughtAtIdx) baseFirst++;
      else same++;
    }
  }

  return {
    game: `${away} @ ${home}`,
    comebacks: comebacks.length,
    possCaught: possResults.filter(r => r.caught).length,
    baseCaught: baseResults.filter(r => r.caught).length,
    possFirst, baseFirst, same,
    possResults, baseResults,
    possPrecision, basePrecision,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const singleGame = args.includes('--game') ? args[args.indexOf('--game') + 1] : null;

  const files = singleGame
    ? [`${singleGame}.json`]
    : fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));

  if (!files.length) {
    console.error('No cached games found. Run sr-nhl-cache.js first.');
    process.exit(1);
  }

  console.log(`\nValidating ${files.length} games...\n`);

  const gameResults = [];
  for (const file of files) {
    const pbp = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file)));
    try {
      const result = analyzeGame(pbp);
      gameResults.push(result);

      const possRate = result.comebacks ? Math.round((result.possCaught / result.comebacks) * 100) : '-';
      const baseRate = result.comebacks ? Math.round((result.baseCaught / result.comebacks) * 100) : '-';
      console.log(`${result.game}`);
      console.log(`  Comebacks: ${result.comebacks} | Poss: ${result.possCaught} (${possRate}%) | Base: ${result.baseCaught} (${baseRate}%)`);
      console.log(`  Timing (shared): poss first ${result.possFirst}, base first ${result.baseFirst}, same ${result.same}`);
      const possPrec = result.possPrecision.fired ? Math.round((result.possPrecision.confirmed / result.possPrecision.fired) * 100) : '-';
      const basePrec = result.basePrecision.fired ? Math.round((result.basePrecision.confirmed / result.basePrecision.fired) * 100) : '-';
      console.log(`  Precision: poss ${result.possPrecision.confirmed}/${result.possPrecision.fired} (${possPrec}%), base ${result.basePrecision.confirmed}/${result.basePrecision.fired} (${basePrec}%)`);
    } catch (err) {
      console.error(`  ERROR ${file}: ${err.message}`);
    }
  }

  const totComebacks = gameResults.reduce((s, r) => s + r.comebacks, 0);
  const totPoss = gameResults.reduce((s, r) => s + r.possCaught, 0);
  const totBase = gameResults.reduce((s, r) => s + r.baseCaught, 0);
  const totPossFirst = gameResults.reduce((s, r) => s + r.possFirst, 0);
  const totBaseFirst = gameResults.reduce((s, r) => s + r.baseFirst, 0);

  console.log('\n─────────────────────────────────────────');
  console.log('AGGREGATE RESULTS');
  console.log('─────────────────────────────────────────');
  console.log(`Games analyzed:              ${gameResults.length}`);
  console.log(`Total comeback scenarios:    ${totComebacks}`);
  console.log(`Possession catch rate:       ${totComebacks ? Math.round((totPoss/totComebacks)*100) : '-'}% (${totPoss}/${totComebacks})`);
  console.log(`Baseline catch rate:         ${totComebacks ? Math.round((totBase/totComebacks)*100) : '-'}% (${totBase}/${totComebacks})`);
  console.log(`Timing — poss fires first:   ${totPossFirst}`);
  console.log(`Timing — base fires first:   ${totBaseFirst}`);

  const totPossFired = gameResults.reduce((s, r) => s + r.possPrecision.fired, 0);
  const totPossConf  = gameResults.reduce((s, r) => s + r.possPrecision.confirmed, 0);
  const totBaseFired = gameResults.reduce((s, r) => s + r.basePrecision.fired, 0);
  const totBaseConf  = gameResults.reduce((s, r) => s + r.basePrecision.confirmed, 0);
  console.log(`Possession precision:        ${totPossFired ? Math.round((totPossConf/totPossFired)*100) : '-'}% (${totPossConf}/${totPossFired})`);
  console.log(`Baseline precision:          ${totBaseFired ? Math.round((totBaseConf/totBaseFired)*100) : '-'}% (${totBaseConf}/${totBaseFired})`);
}

main();
