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
