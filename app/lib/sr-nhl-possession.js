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

const FILTER_TYPES = new Set(['substitution', 'gamesetup', 'challenge']);

function parseZonePossessions(events) {
  const sequences = [];
  let current = null;
  // Track last takeaway timestamp per team (for fast-break bonus detection)
  const lastTakeaway = {}; // teamId -> ms timestamp

  function finalize(seq) {
    if (seq && seq.events.length > 0) sequences.push(seq);
  }

  function startSeq(team, ev) {
    const tsSec = ev.wall_clock ? new Date(ev.wall_clock).getTime() : null;
    const teamId = team.id;
    const fromTakeaway = tsSec != null && lastTakeaway[teamId] != null
      ? (tsSec - lastTakeaway[teamId]) <= 8000
      : false;
    return {
      team,
      period: ev.period || null,
      startClock: ev.clock || null,
      endClock: null,
      strength: ev.strength || 'even',
      fromTakeaway,
      events: [],
    };
  }

  for (const ev of events) {
    const type = ev.event_type;
    if (FILTER_TYPES.has(type)) continue;

    // Track takeaway timestamps before processing boundaries
    if (type === 'takeaway') {
      const teamId = ev.attribution?.id;
      if (teamId && ev.wall_clock) {
        lastTakeaway[teamId] = new Date(ev.wall_clock).getTime();
      }
    }

    // Sequence boundaries
    if (type === 'stoppage' || type === 'endperiod') {
      finalize(current);
      current = null;
      continue;
    }

    if (type === 'faceoff') {
      finalize(current);
      current = null;
      // OZ faceoff win starts a new sequence for the winner
      if (ev.zone === 'offensive') {
        const winnerStat = (ev.statistics || []).find(s => s.type === 'faceoff' && s.win);
        // Only start OZ sequence if zone is offensive from the winner's perspective
        // (SR attributes faceoffs to the winner, so attribution.id === winner.id should hold,
        // but this guard makes the intent explicit and handles any edge cases)
        if (winnerStat?.team && ev.attribution?.id === winnerStat.team.id) {
          current = startSeq(winnerStat.team, ev);
        }
      }
      continue;
    }

    const teamId = ev.attribution?.id;
    if (!teamId || ev.zone !== 'offensive') {
      // Attach blocked shot candidates only — shotmissed events from the opposing team
      // may carry statistics[].type === 'block' which scoreZoneSequence credits to the defender
      if (current && ev.event_type === 'shotmissed' && ev.zone === 'defensive'
          && ev.attribution?.id && ev.attribution.id !== current.team.id) {
        current.events.push(ev);
      }
      continue;
    }

    // Zone flip: different team has offensive zone event
    if (current && teamId !== current.team.id) {
      current.endClock = ev.clock || null;
      finalize(current);
      current = startSeq(ev.attribution, ev);
    } else if (!current) {
      current = startSeq(ev.attribution, ev);
    }

    current.events.push(ev);
  }

  finalize(current);
  return sequences;
}

module.exports = { shotXg, isBlockedShot, getBlockingTeam, parseZonePossessions };
