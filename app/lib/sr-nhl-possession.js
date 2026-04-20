// app/lib/sr-nhl-possession.js

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
