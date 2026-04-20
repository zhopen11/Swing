// app/tests/sr-nhl-possession.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shotXg, isBlockedShot, getBlockingTeam } = require('../lib/sr-nhl-possession');

test('shotXg — slot returns 1.5', () => {
  const ev = { location: { action_area: 'slot' } };
  assert.equal(shotXg(ev), 1.5);
});

test('shotXg — crease returns 1.5', () => {
  assert.equal(shotXg({ location: { action_area: 'crease' } }), 1.5);
});

test('shotXg — downlow returns 1.2', () => {
  assert.equal(shotXg({ location: { action_area: 'downlow' } }), 1.2);
});

test('shotXg — highslot returns 1.0', () => {
  assert.equal(shotXg({ location: { action_area: 'highslot' } }), 1.0);
});

test('shotXg — lowrightpoint returns 0.7', () => {
  assert.equal(shotXg({ location: { action_area: 'lowrightpoint' } }), 0.7);
});

test('shotXg — point returns 0.6', () => {
  assert.equal(shotXg({ location: { action_area: 'point' } }), 0.6);
});

test('shotXg — neutralzone returns 0.2', () => {
  assert.equal(shotXg({ location: { action_area: 'neutralzone' } }), 0.2);
});

test('shotXg — falls back to distance formula when action_area missing', () => {
  // distance 25: 1.5 * (1 - 25/100) = 1.125
  const xg = shotXg({ details: { distance: 25 } });
  assert.ok(Math.abs(xg - 1.125) < 0.001);
});

test('shotXg — distance fallback floors at 0.1', () => {
  assert.equal(shotXg({ details: { distance: 200 } }), 0.1);
});

test('shotXg — unknown area falls back to 0.5', () => {
  assert.equal(shotXg({ location: { action_area: 'unknownzone' } }), 0.5);
});

test('isBlockedShot — true when statistics contains block entry', () => {
  const ev = {
    event_type: 'shotmissed',
    statistics: [
      { type: 'attemptblocked', team: { id: 'a' } },
      { type: 'block', team: { id: 'b' } },
    ],
  };
  assert.equal(isBlockedShot(ev), true);
});

test('isBlockedShot — false for true miss (no block stat)', () => {
  const ev = {
    event_type: 'shotmissed',
    statistics: [],
  };
  assert.equal(isBlockedShot(ev), false);
});

test('getBlockingTeam — returns defending team from block stat', () => {
  const ev = {
    statistics: [
      { type: 'attemptblocked', team: { id: 'shooter' } },
      { type: 'block', team: { id: 'defender', name: 'Avalanche' } },
    ],
  };
  assert.deepEqual(getBlockingTeam(ev), { id: 'defender', name: 'Avalanche' });
});

test('getBlockingTeam — returns null when no block stat', () => {
  assert.equal(getBlockingTeam({ statistics: [] }), null);
});

// ── parseZonePossessions tests ──────────────────────────────────────────────
const { parseZonePossessions } = require('../lib/sr-nhl-possession');

// Helper to build a minimal SR event
function ev(event_type, teamId, zone, wall_clock = '2026-01-01T19:00:00Z', extra = {}) {
  return { event_type, zone, attribution: { id: teamId, name: 'Team' + teamId }, wall_clock, ...extra };
}

test('parseZonePossessions — basic sequence for one team', () => {
  const events = [
    ev('shotsaved', 'A', 'offensive', '2026-01-01T19:00:00Z'),
    ev('shotmissed', 'A', 'offensive', '2026-01-01T19:00:05Z'),
  ];
  const seqs = parseZonePossessions(events);
  assert.equal(seqs.length, 1);
  assert.equal(seqs[0].team.id, 'A');
  assert.equal(seqs[0].events.length, 2);
});

test('parseZonePossessions — substitution events are filtered', () => {
  const events = [
    ev('substitution', 'A', 'offensive'),
    ev('shotsaved', 'A', 'offensive'),
  ];
  const seqs = parseZonePossessions(events);
  assert.equal(seqs.length, 1);
  assert.equal(seqs[0].events.length, 1); // substitution excluded from sequence events
});

test('parseZonePossessions — stoppage ends sequence', () => {
  const events = [
    ev('shotsaved', 'A', 'offensive'),
    ev('stoppage', 'A', 'offensive'),
    ev('shotsaved', 'A', 'offensive'),
  ];
  const seqs = parseZonePossessions(events);
  assert.equal(seqs.length, 2);
});

test('parseZonePossessions — faceoff ends sequence; OZ faceoff win starts new one', () => {
  const faceoffEv = {
    event_type: 'faceoff',
    zone: 'offensive',
    attribution: { id: 'A', name: 'TeamA' },
    wall_clock: '2026-01-01T19:01:00Z',
    statistics: [{ type: 'faceoff', win: true, team: { id: 'A' } }],
  };
  const events = [
    ev('shotsaved', 'A', 'offensive', '2026-01-01T19:00:00Z'),
    faceoffEv,
    ev('shotsaved', 'A', 'offensive', '2026-01-01T19:01:05Z'),
  ];
  const seqs = parseZonePossessions(events);
  assert.equal(seqs.length, 2); // original + new sequence after OZ faceoff win
  assert.equal(seqs[1].team.id, 'A');
});

test('parseZonePossessions — zone flip to other team starts new sequence', () => {
  const events = [
    ev('shotsaved', 'A', 'offensive', '2026-01-01T19:00:00Z'),
    ev('shotsaved', 'B', 'offensive', '2026-01-01T19:00:10Z'),
  ];
  const seqs = parseZonePossessions(events);
  assert.equal(seqs.length, 2);
  assert.equal(seqs[0].team.id, 'A');
  assert.equal(seqs[1].team.id, 'B');
});

test('parseZonePossessions — sequence carries strength state from first event', () => {
  const events = [
    { event_type: 'shotsaved', zone: 'offensive', strength: 'powerplay',
      attribution: { id: 'A', name: 'TeamA' }, wall_clock: '2026-01-01T19:00:00Z' },
    ev('shotmissed', 'A', 'offensive', '2026-01-01T19:00:05Z'),
  ];
  const seqs = parseZonePossessions(events);
  assert.equal(seqs[0].strength, 'powerplay');
});

test('parseZonePossessions — takeaway flag set when sequence starts within 8s of team takeaway', () => {
  const takeaway = { event_type: 'takeaway', zone: 'defensive',
    attribution: { id: 'A', name: 'TeamA' }, wall_clock: '2026-01-01T19:00:00Z', statistics: [] };
  const events = [
    takeaway,
    ev('shotsaved', 'A', 'offensive', '2026-01-01T19:00:06Z'),
  ];
  const seqs = parseZonePossessions(events);
  assert.equal(seqs.length, 1);
  assert.equal(seqs[0].fromTakeaway, true);
});

test('parseZonePossessions — takeaway flag NOT set when more than 8s elapsed', () => {
  const takeaway = { event_type: 'takeaway', zone: 'defensive',
    attribution: { id: 'A', name: 'TeamA' }, wall_clock: '2026-01-01T19:00:00Z', statistics: [] };
  const events = [
    takeaway,
    ev('shotsaved', 'A', 'offensive', '2026-01-01T19:00:10Z'),
  ];
  const seqs = parseZonePossessions(events);
  assert.equal(seqs[0].fromTakeaway, false);
});

// ── scoreZoneSequence tests ────────────────────────────────────────────────
const { scoreZoneSequence } = require('../lib/sr-nhl-possession');

function makeSeq(events, fromTakeaway = false) {
  return { team: { id: 'A' }, events, fromTakeaway, strength: 'even' };
}

function shotSavedEv(area, teamId = 'A') {
  return { event_type: 'shotsaved', zone: 'offensive',
    attribution: { id: teamId }, location: { action_area: area }, statistics: [] };
}

function goalEv(teamId = 'A') {
  return { event_type: 'goal', zone: 'offensive',
    attribution: { id: teamId }, location: { action_area: 'slot' }, statistics: [] };
}

function missedEv(area = 'point', teamId = 'A') {
  return { event_type: 'shotmissed', zone: 'offensive',
    attribution: { id: teamId }, location: { action_area: area }, statistics: [] };
}

function blockedEv(shooterId = 'A', defenderId = 'B', area = 'point') {
  return {
    event_type: 'shotmissed', zone: 'offensive',
    attribution: { id: shooterId },
    location: { action_area: area },
    statistics: [
      { type: 'attemptblocked', team: { id: shooterId } },
      { type: 'block', team: { id: defenderId, name: 'TeamB' } },
    ],
  };
}

function giveawayEv(zone = 'offensive', teamId = 'A') {
  return { event_type: 'giveaway', zone, attribution: { id: teamId }, statistics: [] };
}

test('scoreZoneSequence — goal scores +3.0', () => {
  const result = scoreZoneSequence(makeSeq([goalEv()]));
  assert.equal(result.score, 3.0);
});

test('scoreZoneSequence — slot shotsaved scores +1.5', () => {
  const result = scoreZoneSequence(makeSeq([shotSavedEv('slot')]));
  assert.equal(result.score, 1.5);
});

test('scoreZoneSequence — true miss scores 0.4 * xG', () => {
  // point xG = 0.6, miss = 0.4 * 0.6 = 0.24
  const result = scoreZoneSequence(makeSeq([missedEv('point')]));
  assert.ok(Math.abs(result.score - 0.24) < 0.001);
});

test('scoreZoneSequence — blocked shot gives 0 to shooter, +0.5 defense credit', () => {
  const result = scoreZoneSequence(makeSeq([blockedEv('A', 'B', 'point')]));
  assert.equal(result.score, 0);
  assert.equal(result.defenseCredits['B'], 0.5);
});

test('scoreZoneSequence — giveaway in offensive zone scores -1.0', () => {
  const result = scoreZoneSequence(makeSeq([giveawayEv('offensive')]));
  assert.equal(result.score, -1.0);
});

test('scoreZoneSequence — giveaway in defensive zone scores -1.5', () => {
  const result = scoreZoneSequence(makeSeq([giveawayEv('defensive')]));
  assert.equal(result.score, -1.5);
});

test('scoreZoneSequence — icing stoppage scores -0.5', () => {
  const icingEv = { event_type: 'stoppage', stoppage_type: 'icing',
    attribution: { id: 'A' }, statistics: [] };
  const result = scoreZoneSequence(makeSeq([icingEv]));
  assert.equal(result.score, -0.5);
});

test('scoreZoneSequence — second shot in sequence gets +0.3 sustained pressure bonus', () => {
  const events = [shotSavedEv('slot'), shotSavedEv('slot')];
  const result = scoreZoneSequence(makeSeq(events));
  // 1.5 (first) + 1.5 + 0.3 (second + sustained bonus) = 3.3
  assert.ok(Math.abs(result.score - 3.3) < 0.001);
});

test('scoreZoneSequence — fromTakeaway adds +1.5 bonus to total', () => {
  const result = scoreZoneSequence(makeSeq([shotSavedEv('slot')], true));
  // 1.5 (shot) + 1.5 (takeaway bonus) = 3.0
  assert.equal(result.score, 3.0);
});

// ── computeZoneMomentum tests ──────────────────────────────────────────────
const { computeZoneMomentum, detectAlerts } = require('../lib/sr-nhl-possession');

function scoredSeq(teamId, score) {
  return { team: { id: teamId }, score, defenseCredits: {} };
}

test('computeZoneMomentum — equal recent sequences returns ~50/50', () => {
  const scored = [
    scoredSeq('home', 2.0), scoredSeq('away', 2.0),
    scoredSeq('home', 2.0), scoredSeq('away', 2.0),
  ];
  const result = computeZoneMomentum('home', 'away', scored);
  assert.ok(Math.abs(result.home - 50) <= 5);
  assert.ok(Math.abs(result.away - 50) <= 5);
});

test('computeZoneMomentum — home dominance pushes home above 60', () => {
  const scored = [];
  for (let i = 0; i < 8; i++) scored.push(scoredSeq('home', 3.0));
  for (let i = 0; i < 2; i++) scored.push(scoredSeq('away', 0.5));
  const result = computeZoneMomentum('home', 'away', scored);
  assert.ok(result.home > 60, `expected home > 60, got ${result.home}`);
});

test('computeZoneMomentum — scores sum to 100', () => {
  const scored = [
    scoredSeq('home', 1.5), scoredSeq('away', 3.0),
    scoredSeq('home', 2.0), scoredSeq('away', 1.0),
  ];
  const result = computeZoneMomentum('home', 'away', scored);
  assert.equal(result.home + result.away, 100);
});

test('computeZoneMomentum — empty sequences returns 50/50', () => {
  const result = computeZoneMomentum('home', 'away', []);
  assert.equal(result.home, 50);
  assert.equal(result.away, 50);
});

test('computeZoneMomentum — incorporates defense credits into opposing team window', () => {
  // Away team earns a block credit against home team sequence
  const scored = [
    { team: { id: 'home' }, score: 0, defenseCredits: { away: 0.5 } },
  ];
  const result = computeZoneMomentum('home', 'away', scored);
  // Away has credit, home has 0 — away should be above 50
  assert.ok(result.away > 50);
});

// Alert tests
test('detectAlerts — Score Is Bluffing fires when score leader trails momentum by ≥10', () => {
  // Home leads score 2-1 but away leads momentum 65-35
  const alerts = detectAlerts(35, 65, 2, 1, 'even');
  assert.ok(alerts.some(a => a.type === 'SIB'));
});

test('detectAlerts — no SIB when momentum gap < 10', () => {
  const alerts = detectAlerts(46, 54, 2, 1, 'even');
  assert.equal(alerts.filter(a => a.type === 'SIB').length, 0);
});

test('detectAlerts — Comeback Watch fires when down ≥2 goals and momentum lead ≥15', () => {
  // Away down 3-1 (2 goals) but leads momentum 60-40
  const alerts = detectAlerts(40, 60, 3, 1, 'even');
  assert.ok(alerts.some(a => a.type === 'CW'));
});

test('detectAlerts — Comeback Watch does NOT fire when down only 1 goal', () => {
  const alerts = detectAlerts(40, 60, 2, 1, 'even');
  assert.equal(alerts.filter(a => a.type === 'CW').length, 0);
});

test('detectAlerts — Comeback Watch does NOT fire when momentum gap < 15', () => {
  // Away down 2 goals but momentum gap only 10
  const alerts = detectAlerts(45, 55, 3, 1, 'even');
  assert.equal(alerts.filter(a => a.type === 'CW').length, 0);
});

test('detectAlerts — Swing Warning fires when score gap ≤1 and momentum gap ≥15', () => {
  // Tied game but home dominates momentum 70-30
  const alerts = detectAlerts(70, 30, 1, 1, 'even');
  assert.ok(alerts.some(a => a.type === 'SW'));
});

test('detectAlerts — Swing Warning fires with 1-goal difference', () => {
  const alerts = detectAlerts(70, 30, 2, 1, 'even');
  assert.ok(alerts.some(a => a.type === 'SW'));
});

test('detectAlerts — Comeback Watch gets SH flag when leading team is shorthanded', () => {
  // Away down 2 goals, leads momentum, AND the home team (score leader) is shorthanded
  const alerts = detectAlerts(40, 60, 3, 1, 'shorthanded');
  const cw = alerts.find(a => a.type === 'CW');
  assert.ok(cw);
  assert.equal(cw.flag, 'SH');
});
