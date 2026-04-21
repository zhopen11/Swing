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

const HIGH_DANGER = new Set(['slot', 'crease', 'downlow']);
const SHOT_TYPES  = new Set(['goal', 'shotsaved', 'shotmissed']);
const FILTER      = new Set(['substitution', 'gamesetup', 'challenge']);
const WINDOW_MS   = 3 * 60 * 1000; // 3-minute rolling window for HDSR

// ── Momentum models — all share the same interface: ──────────────────────────
//   getMomentum(eventsUpToNow, homeId, awayId) → { home: 0-100, away: 0-100 }

function possessionMomentum(events, homeId, awayId) {
  const seqs   = parseZonePossessions(events);
  const scored = seqs.map(s => ({ ...s, ...scoreZoneSequence(s) }));
  return computeZoneMomentum(homeId, awayId, scored);
}

function baselineMomentum(events, homeId, awayId) {
  const recent = events.filter(e => SHOT_TYPES.has(e.event_type)).slice(-10);
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

// High-Danger Shot Rate: weight slot/crease/downlow attempts 10x over perimeter
// shots in a 3-minute rolling window. Directly measures territorial quality
// pressure — different from raw Corsi because perimeter dumps don't move the needle.
function hdsrMomentum(events, homeId, awayId) {
  const last = events[events.length - 1];
  const curTime = last?.wall_clock ? new Date(last.wall_clock).getTime() : null;
  let home = 0, away = 0;

  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (!SHOT_TYPES.has(ev.event_type)) continue;

    if (curTime && ev.wall_clock) {
      const evTime = new Date(ev.wall_clock).getTime();
      if (curTime - evTime > WINDOW_MS) break;
    } else if (curTime == null) {
      // No wall_clock available — fall back to last 20 shot events
      const shotCount = events.slice(i).filter(e => SHOT_TYPES.has(e.event_type)).length;
      if (shotCount > 20) break;
    }

    const area   = (ev.location?.action_area || '').toLowerCase();
    const weight = HIGH_DANGER.has(area) ? 1.0 : 0.1;
    const teamId = ev.attribution?.id;
    if (teamId === homeId) home += weight;
    else if (teamId === awayId) away += weight;
  }

  const total = home + away;
  if (total < 0.2) return { home: 50, away: 50 }; // not enough data yet
  return { home: Math.round((home / total) * 100), away: Math.round((away / total) * 100) };
}

const MODELS = {
  poss: possessionMomentum,
  base: baselineMomentum,
  hdsr: hdsrMomentum,
};

// ── Shared utilities ──────────────────────────────────────────────────────────

function getScore(ev) {
  return { home: ev.home_points ?? 0, away: ev.away_points ?? 0 };
}

function flattenEvents(pbp) {
  return (pbp.periods || []).flatMap(p =>
    (p.events || []).map(e => ({ ...e, period: e.period ?? p.number ?? p.sequence }))
  );
}

// ── Find comeback scenarios: trailing ≥1 goal, closes ≥1 within 120 events ───
function findComebacks(events, homeId, awayId) {
  const filtered = events.filter(e => !FILTER.has(e.event_type));
  const comebacks = [];

  for (let i = 0; i < filtered.length; i++) {
    const score = getScore(filtered[i]);
    const diff  = score.home - score.away;
    if ((filtered[i].period || 1) < 2) continue;
    if (Math.abs(diff) < 1) continue;

    const trailingTeam  = diff > 0 ? awayId : homeId;
    const trailingGoals = diff > 0 ? score.away : score.home;
    const leadingGoals  = diff > 0 ? score.home : score.away;

    const lookahead = filtered.slice(i + 1, i + 121);
    let closed = false;
    for (const fev of lookahead) {
      const fs = getScore(fev);
      const newTrailing = trailingTeam === homeId ? fs.home : fs.away;
      const newLeading  = trailingTeam === homeId ? fs.away : fs.home;
      if (newLeading - newTrailing < leadingGoals - trailingGoals) { closed = true; break; }
    }

    if (closed) {
      comebacks.push({ eventIdx: i, trailingTeam, scoreDiff: Math.abs(diff) });
      i += 30;
    }
  }
  return comebacks;
}

// ── Catch rate: does CW fire at or before each comeback scenario? ─────────────
function modelCatchesComebacks(events, comebacks, homeId, awayId, getMomentum) {
  const filtered = events.filter(e => !FILTER.has(e.event_type));
  return comebacks.map(cb => {
    const scanStart = Math.max(0, cb.eventIdx - 120);
    let caughtAt = null;
    for (let i = scanStart; i <= cb.eventIdx; i++) {
      const score = getScore(filtered[i]);
      const mom   = getMomentum(filtered.slice(0, i + 1), homeId, awayId);
      const str   = filtered[i].strength || 'even';
      const alerts = detectAlerts(mom.home, mom.away, score.home, score.away, str, str);
      if (alerts.some(a => a.type === 'CW')) { caughtAt = i; break; }
    }
    return { ...cb, caught: caughtAt !== null, caughtAtIdx: caughtAt };
  });
}

// ── Alert precision: of CW/SIB alerts, what % confirm via score closure? ─────
function computeAlertPrecision(events, homeId, awayId, getMomentum) {
  const filtered = events.filter(e => !FILTER.has(e.event_type));
  let fired = 0, confirmed = 0;
  for (let i = 0; i < filtered.length; i++) {
    const score = getScore(filtered[i]);
    if (Math.abs(score.home - score.away) < 2) continue;
    const mom  = getMomentum(filtered.slice(0, i + 1), homeId, awayId);
    const str  = filtered[i].strength || 'even';
    const alerts = detectAlerts(mom.home, mom.away, score.home, score.away, str, str);
    if (!alerts.some(a => a.type === 'CW' || a.type === 'SIB')) continue;
    fired++;
    const curLead = Math.max(score.home, score.away) - Math.min(score.home, score.away);
    const lookahead = filtered.slice(i + 1, i + 121);
    for (const fev of lookahead) {
      if (Math.abs(getScore(fev).home - getScore(fev).away) < curLead) { confirmed++; break; }
    }
    i += 10;
  }
  return { fired, confirmed };
}

// ── Per-game analysis ─────────────────────────────────────────────────────────
function analyzeGame(pbp) {
  const homeId = pbp.home.id;
  const awayId = pbp.away.id;
  const home   = pbp.home.alias || pbp.home.name;
  const away   = pbp.away.alias || pbp.away.name;

  const events    = flattenEvents(pbp);
  const comebacks = findComebacks(events, homeId, awayId);

  const results   = {};
  const precision = {};
  for (const [name, fn] of Object.entries(MODELS)) {
    results[name]   = modelCatchesComebacks(events, comebacks, homeId, awayId, fn);
    precision[name] = computeAlertPrecision(events, homeId, awayId, fn);
  }

  // Timing: HDSR vs baseline (the key comparison)
  let hdsrFirst = 0, baseFirst = 0, same = 0;
  for (let i = 0; i < comebacks.length; i++) {
    const h = results.hdsr[i];
    const b = results.base[i];
    if (h.caught && b.caught) {
      if (h.caughtAtIdx < b.caughtAtIdx) hdsrFirst++;
      else if (b.caughtAtIdx < h.caughtAtIdx) baseFirst++;
      else same++;
    }
  }

  return {
    game: `${away} @ ${home}`,
    comebacks: comebacks.length,
    caught: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.filter(r => r.caught).length])),
    precision,
    hdsrFirst, baseFirst, same,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const args       = process.argv.slice(2);
  const singleGame = args.includes('--game') ? args[args.indexOf('--game') + 1] : null;
  const files      = singleGame
    ? [`${singleGame}.json`]
    : fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json') && f !== 'manifest.json');

  if (!files.length) { console.error('No cached games found.'); process.exit(1); }

  console.log(`\nValidating ${files.length} games...\n`);

  const gameResults = [];
  for (const file of files) {
    const pbp = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file)));
    try {
      const r = analyzeGame(pbp);
      gameResults.push(r);
      const pct = n => r.comebacks ? Math.round((n / r.comebacks) * 100) + '%' : '-';
      console.log(`${r.game}`);
      console.log(`  Comebacks: ${r.comebacks} | HDSR: ${r.caught.hdsr} (${pct(r.caught.hdsr)}) | Base: ${r.caught.base} (${pct(r.caught.base)}) | Poss: ${r.caught.poss} (${pct(r.caught.poss)})`);
      console.log(`  Timing HDSR vs Base: hdsr first ${r.hdsrFirst}, base first ${r.baseFirst}, same ${r.same}`);
      const prec = (p) => p.fired ? `${Math.round((p.confirmed / p.fired) * 100)}%` : '-';
      console.log(`  Precision: HDSR ${prec(r.precision.hdsr)} (${r.precision.hdsr.confirmed}/${r.precision.hdsr.fired}), Base ${prec(r.precision.base)} (${r.precision.base.confirmed}/${r.precision.base.fired}), Poss ${prec(r.precision.poss)} (${r.precision.poss.confirmed}/${r.precision.poss.fired})`);
    } catch (err) {
      console.error(`  ERROR ${file}: ${err.message}`);
    }
  }

  const tot  = (key) => gameResults.reduce((s, r) => s + r.comebacks, 0);
  const totC = (model) => gameResults.reduce((s, r) => s + r.caught[model], 0);
  const totF = (model) => gameResults.reduce((s, r) => s + r.precision[model].fired, 0);
  const totK = (model) => gameResults.reduce((s, r) => s + r.precision[model].confirmed, 0);

  const totComebacks = gameResults.reduce((s, r) => s + r.comebacks, 0);
  const totHdsrFirst = gameResults.reduce((s, r) => s + r.hdsrFirst, 0);
  const totBaseFirst = gameResults.reduce((s, r) => s + r.baseFirst, 0);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  AGGREGATE RESULTS');
  console.log('  Ground truth: ≥1 goal down, score closes ≥1 within 120 events');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Games analyzed      : ${gameResults.length}`);
  console.log(`  Comeback scenarios  : ${totComebacks}`);
  console.log('');
  console.log(`  ${'Model'.padEnd(8)} ${'Catch%'.padStart(8)} ${'Caught'.padStart(8)} ${'Fired'.padStart(8)} ${'Prec%'.padStart(8)}`);
  console.log(`  ${'─'.repeat(48)}`);
  for (const model of ['hdsr', 'base', 'poss']) {
    const caught = totC(model);
    const fired  = totF(model);
    const conf   = totK(model);
    const catchPct = totComebacks ? Math.round((caught / totComebacks) * 100) + '%' : '-';
    const precPct  = fired        ? Math.round((conf / fired) * 100) + '%'          : '-';
    const label = model === 'hdsr' ? 'HDSR ◆' : model === 'base' ? 'Base  ○' : 'Poss  ·';
    console.log(`  ${label.padEnd(8)} ${catchPct.padStart(8)} ${String(caught).padStart(8)} ${String(fired).padStart(8)} ${precPct.padStart(8)}`);
  }
  console.log('');
  console.log(`  Timing (HDSR vs Base on shared catches):`);
  console.log(`    HDSR fires first : ${totHdsrFirst}`);
  console.log(`    Base fires first : ${totBaseFirst}`);
  const timingTotal = totHdsrFirst + totBaseFirst;
  if (timingTotal > 0) {
    console.log(`    HDSR first rate  : ${Math.round((totHdsrFirst / timingTotal) * 100)}%`);
  }
  console.log('══════════════════════════════════════════════════════════════\n');
}

main();
