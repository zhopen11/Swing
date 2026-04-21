/** The Swing — Sportradar API client + ESPN-shape normalizer. */

// Trial tier: 1 req/sec hard limit
const SR_DELAY = 1200;

/**
 * Create a sport-specific Sportradar client.
 *
 * @param {{ base: string, envKey: string }} config
 *   base   — SR API base URL, e.g. 'https://api.sportradar.com/nba/trial/v8/en'
 *   envKey — env var name holding the API key, e.g. 'SPORTRADAR_NBA_KEY'
 * @returns {{ fetchDailySchedule, fetchPbp, normalizePbp, srAlias, SR_DELAY }}
 */
function createClient({ base, envKey }) {
  function getKey() {
    return process.env[envKey];
  }

  async function fetchJson(url) {
    const key = getKey();
    if (!key) throw new Error(`${envKey} is not set`);

    const sep = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${sep}api_key=${key}`;

    const resp = await fetch(fullUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`HTTP ${resp.status} from ${url}: ${body.slice(0, 300)}`);
    }

    return resp.json();
  }

  /**
   * Fetch all games for a date.
   * @param {string} date  YYYY-MM-DD
   */
  async function fetchDailySchedule(date) {
    const [y, m, d] = date.split('-');
    return fetchJson(`${base}/games/${y}/${m}/${d}/schedule.json`);
  }

  /**
   * Fetch play-by-play for a Sportradar game ID.
   * @param {string} gameId  Sportradar GUID
   */
  async function fetchPbp(gameId) {
    return fetchJson(`${base}/games/${gameId}/pbp.json`);
  }

  return { fetchDailySchedule, fetchPbp, normalizePbp, srAlias, SR_DELAY };
}

// Default NCAAB client — backward compatible with all existing scripts.
const _ncaab = createClient({
  base: 'https://api.sportradar.com/ncaamb/trial/v8/en',
  envKey: 'SPORTRADAR_KEY',
});

/**
 * Convert a Sportradar NCAAB PBP response into ESPN-shaped play objects
 * compatible with momentum.computeMomentumFromPlays().
 *
 * Sportradar structure:
 *   pbpData.periods[].events[] with fields:
 *     event_type, description, clock, updated, attribution, statistics (array),
 *     location.action_area, home_points (delta), away_points (delta)
 *
 * NOTE: statistics is an ARRAY of stat objects, not a keyed object.
 * Shot classification uses event_type directly — do not access stats.fieldgoal.
 *
 * Output shape per play (matches what scorePossession() and resolveTeam() expect):
 *   text, type.text, shootingPlay, scoreValue,
 *   team.id, team.abbreviation,
 *   homeScore, awayScore, period.number, clock.displayValue, wallclock,
 *   actionArea (SR zone — bonus field for SR-native algorithm)
 */
function normalizePbp(pbpData) {
  const periods = pbpData.periods || [];
  const plays = [];
  let homeScore = 0;
  let awayScore = 0;

  for (const period of periods) {
    const periodNum = period.number || period.sequence || 1;

    for (const event of (period.events || [])) {
      // statistics is an array — find entries by type
      const statsArr = Array.isArray(event.statistics) ? event.statistics : [];
      const fgStat    = statsArr.find(s => s.type === 'fieldgoal');
      const ftStat    = statsArr.find(s => s.type === 'freethrow');
      const rebStat   = statsArr.find(s => s.type === 'rebound');
      const toStat    = statsArr.find(s => s.type === 'turnover');
      const stealStat = statsArr.find(s => s.type === 'steal');
      const blockStat = statsArr.find(s => s.type === 'block');

      // SR home_points/away_points are RUNNING TOTALS, not deltas.
      // Assign directly (not accumulate) so play.homeScore = actual current score.
      homeScore = event.home_points || homeScore;
      awayScore = event.away_points || awayScore;

      // --- Shooting play classification via event_type (reliable) ---
      const evType = event.event_type || '';
      const isTwoPt   = evType === 'twopointmade'   || evType === 'twopointmiss';
      const isThreePt  = evType === 'threepointmade' || evType === 'threepointmiss';
      const isFT       = evType === 'freethrowmade'  || evType === 'freethrowmiss';
      const isShooting = isTwoPt || isThreePt || isFT;
      const scoreValue = isThreePt ? 3 : isTwoPt ? 2 : isFT ? 1 : 0;

      // --- Play type string (used by scorePossession for non-shooting events) ---
      let typeText = evType.toLowerCase();
      if (rebStat) {
        typeText = rebStat.rebound_type === 'offensive' ? 'offensive rebound' : 'defensive rebound';
      }
      if (toStat)    typeText = 'turnover';
      if (stealStat) typeText = 'steal';
      if (blockStat) typeText = 'block';

      // --- Description text ---
      // SR descriptions include "makes"/"misses" natively so scorePossession()
      // make/miss detection works without modification.
      const text = event.description || '';

      plays.push({
        text,
        type: { text: typeText },
        shootingPlay: isShooting,
        scoreValue,
        team: {
          id: event.attribution?.id || null,
          abbreviation: event.attribution?.alias || null,
        },
        homeScore,
        awayScore,
        period: { number: periodNum },
        clock: { displayValue: formatClock(event.clock) },
        wallclock: event.updated || null,
        actionArea: event.location?.action_area || null,
      });
    }
  }

  return plays;
}

/**
 * Sportradar clock format is "MM:SS" (e.g. "19:45").
 * ESPN uses the same format, so no conversion needed — just pass through.
 */
function formatClock(clock) {
  return clock || '';
}

/**
 * Extract the ESPN-compatible abbreviation from a Sportradar team object.
 * Sportradar uses `alias`; ESPN uses `abbreviation`. They're usually identical.
 */
function srAlias(team) {
  return (team?.alias || '').toUpperCase();
}

module.exports = { ..._ncaab, createClient };
