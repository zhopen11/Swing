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
