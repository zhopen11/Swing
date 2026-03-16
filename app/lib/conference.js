/** Conference strength tiers for CBB MVIX/MRVI adjustment. */

const CONF_STRENGTH = {
  // Tier 1 (1.0): Power conferences
  B10: 1.0, B12: 1.0, SEC: 1.0, ACC: 1.0, BE: 1.0,
  // Tier 2 (0.85): Strong mid-majors
  WCC: 0.85, MWC: 0.85, MVC: 0.85,
  // Tier 3 (0.80): Upper mid-majors
  AAC: 0.80, A10: 0.80,
  // Tier 4 (0.70): Mid-majors
  CUSA: 0.70, SUN: 0.70, MAC: 0.70, WAC: 0.70, SOU: 0.70, IVY: 0.70,
  CAA: 0.70, HORZ: 0.70, PAT: 0.70, BSK: 0.70, BSO: 0.70, BW: 0.70,
  ASUN: 0.70, MAAC: 0.70, SUMM: 0.70,
  // Tier 5 (0.65): Low-majors
  OVC: 0.65, AMEA: 0.65, BSKY: 0.65, SWC: 0.65,
  // Tier 6 (0.60): Lowest
  NEC: 0.60, MEAC: 0.60,
};

const TEAM_CONF = {
  // Big Ten
  MICH: 'B10', PUR: 'B10', MSU: 'B10', ILL: 'B10', NEB: 'B10',
  WIS: 'B10', IOWA: 'B10', OSU: 'B10',
  // Big 12
  HOU: 'B12', ISU: 'B12', KU: 'B12', TTU: 'B12', BYU: 'B12',
  UCLA: 'B12', ARIZ: 'B12', UCF: 'B12', TCU: 'B12',
  // SEC
  FLA: 'SEC', ALA: 'SEC', ARK: 'SEC', TENN: 'SEC', UK: 'SEC',
  UGA: 'SEC', VAN: 'SEC', 'TA&M': 'SEC', MIZ: 'SEC', TEX: 'SEC',
  // ACC
  DUKE: 'ACC', UNC: 'ACC', CLEM: 'ACC', LOU: 'ACC', UVA: 'ACC',
  SMU: 'ACC', MIA: 'ACC',
  // Big East
  CONN: 'BE', SJU: 'BE', VILL: 'BE',
  // WCC
  GONZ: 'WCC', SMC: 'WCC', SCU: 'WCC',
  // Others
  USU: 'MWC', UNI: 'MVC', USF: 'AAC', MCN: 'AAC',
  VCU: 'A10', SLU: 'A10', TROY: 'SUN', AKR: 'MAC',
  FUR: 'SOU', PENN: 'IVY', HOF: 'CAA', HPU: 'BSO',
  HAW: 'BW', TNST: 'OVC', HOW: 'SWC', PV: 'SWC',
  LIU: 'NEC', UMBC: 'AMEA', KENN: 'ASUN', SIE: 'MAAC',
  IDHO: 'BSKY', WRST: 'HORZ', CBU: 'WAC', QUC: 'ASUN',
  NDSU: 'SUMM', LEH: 'PAT', 'M-OH': 'MAC',
};

export function getConference(team) {
  return TEAM_CONF[team] || null;
}

export function getConfStrength(team) {
  const conf = TEAM_CONF[team];
  if (!conf) return 0.70; // default for unknown
  return CONF_STRENGTH[conf] || 0.70;
}

/**
 * Adjust MRVI by conference strength.
 * Shrinks distance from 50 (neutral) for weaker conferences.
 */
export function adjustMrvi(mrvi, team) {
  if (mrvi == null) return null;
  const s = getConfStrength(team);
  return Math.round((50 + (mrvi - 50) * s) * 10) / 10;
}

/**
 * Adjust MVIX by conference strength.
 * Inflates MVIX toward 50 for weaker conferences (low MVIX from weak opponents is less meaningful).
 */
export function adjustMvix(mvix, team) {
  if (mvix == null) return null;
  const s = getConfStrength(team);
  return Math.round((mvix + (50 - mvix) * (1 - s)) * 10) / 10;
}
