/**
 * The Swing — SR NHL Possession Model
 *
 * Zone-possession-efficiency momentum model for NHL hockey. Produces
 * 0–100 momentum scores per team and three alert types (SIB, CW, SW)
 * validated against a raw shot count baseline.
 *
 * Architecture: SR NHL PBP events are grouped into zone possession
 * sequences via the top-level `zone` field. Each sequence is scored
 * using xG-weighted shot quality + giveaway/icing penalties. A sliding
 * window of 8 sequences per team with exponential decay normalizes to
 * 0–100. Blocked shots are identified via statistics[].type === 'block'
 * within `shotmissed` events and credited to the defending team.
 */

const XG_BY_AREA = {
  slot:           1.5,
  crease:         1.5,
  downlow:        1.2,
  highslot:       1.0,
  lowleftpoint:   0.7,
  lowrightpoint:  0.7,
  leftpoint:      0.6,
  rightpoint:     0.6,
  point:          0.6,
  neutralzone:    0.2,
  defensivezone:  0.2,
};

const DEFAULT_XG = 0.5;

function shotXg(event) {
  const area = (event.location?.action_area || '').toLowerCase().replace(/\s+/g, '');
  if (area && XG_BY_AREA[area] !== undefined) return XG_BY_AREA[area];
  const dist = event.details?.distance;
  if (dist != null) return Math.max(0.1, 1.5 * (1 - dist / 100));
  return DEFAULT_XG;
}

function isBlockedShot(event) {
  return (event.statistics || []).some(s => s.type === 'block');
}

function getBlockingTeam(event) {
  return (event.statistics || []).find(s => s.type === 'block')?.team ?? null;
}

module.exports = { shotXg, isBlockedShot, getBlockingTeam };
