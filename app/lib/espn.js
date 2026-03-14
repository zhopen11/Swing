/** The Swing — ESPN API client. */

const { NBA_SCOREBOARD, CBB_SCOREBOARD, NBA_SUMMARY, CBB_SUMMARY } = require('./config');

async function fetchJSON(url, retries = 1) {
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${sep}_t=${Date.now()}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(fullUrl, {
        headers: { 'User-Agent': 'TheSwing/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      console.warn(`Failed to fetch ${url}: ${e.message}`);
      return null;
    }
  }
}

async function fetchNbaScoreboard(dateStr) {
  if (dateStr) {
    const url = `${NBA_SCOREBOARD}?dates=${dateStr}`;
    const data = await fetchJSON(url);
    return data?.events || [];
  }

  // Before 6am ET, fetch yesterday too for late games
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = eastern.getHours();

  if (hour < 6) {
    const yesterday = new Date(eastern);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr =
      yesterday.getFullYear().toString() +
      String(yesterday.getMonth() + 1).padStart(2, '0') +
      String(yesterday.getDate()).padStart(2, '0');

    const [todayData, yesterdayData] = await Promise.all([
      fetchJSON(NBA_SCOREBOARD),
      fetchJSON(`${NBA_SCOREBOARD}?dates=${yesterdayStr}`),
    ]);

    const todayEvents = todayData?.events || [];
    const yesterdayEvents = yesterdayData?.events || [];
    const seen = new Set();
    const merged = [];
    for (const e of [...yesterdayEvents, ...todayEvents]) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }
    return merged;
  }

  const data = await fetchJSON(NBA_SCOREBOARD);
  return data?.events || [];
}

async function fetchCbbScoreboard(dateStr) {
  if (dateStr) {
    const url = `${CBB_SCOREBOARD}?dates=${dateStr}&groups=50&limit=200`;
    const data = await fetchJSON(url);
    return data?.events || [];
  }

  // Use Eastern time, but before 6am fetch yesterday too (late games)
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayStr =
    eastern.getFullYear().toString() +
    String(eastern.getMonth() + 1).padStart(2, '0') +
    String(eastern.getDate()).padStart(2, '0');

  const hour = eastern.getHours();
  if (hour < 6) {
    // Before 6am ET — fetch both yesterday and today
    const yesterday = new Date(eastern);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr =
      yesterday.getFullYear().toString() +
      String(yesterday.getMonth() + 1).padStart(2, '0') +
      String(yesterday.getDate()).padStart(2, '0');

    const [todayData, yesterdayData] = await Promise.all([
      fetchJSON(`${CBB_SCOREBOARD}?dates=${todayStr}&groups=50&limit=200`),
      fetchJSON(`${CBB_SCOREBOARD}?dates=${yesterdayStr}&groups=50&limit=200`),
    ]);

    const todayEvents = todayData?.events || [];
    const yesterdayEvents = yesterdayData?.events || [];
    // Merge, deduplicate by event id
    const seen = new Set();
    const merged = [];
    for (const e of [...yesterdayEvents, ...todayEvents]) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }
    return merged;
  }

  const url = `${CBB_SCOREBOARD}?dates=${todayStr}&groups=50&limit=200`;
  const data = await fetchJSON(url);
  return data?.events || [];
}

async function fetchGameSummary(gameId, league) {
  const url = league === 'NBA' ? NBA_SUMMARY(gameId) : CBB_SUMMARY(gameId);
  return fetchJSON(url);
}

function parseScoreboardEvent(event, league) {
  const comp = event.competitions?.[0] || {};
  const competitors = comp.competitors || [];

  const home = competitors.find((c) => c.homeAway === 'home') || {};
  const away = competitors.find((c) => c.homeAway === 'away') || {};

  const homeTeam = home.team || {};
  const awayTeam = away.team || {};

  const statusObj = event.status || {};
  const status = statusObj.type?.name || '';

  let network = '';
  const broadcasts = comp.broadcasts || [];
  if (broadcasts.length > 0) {
    const names = broadcasts[0].names || [];
    if (names.length > 0) network = names[0];
    else if (broadcasts[0].media?.shortName) network = broadcasts[0].media.shortName;
  }

  let venue = '';
  if (comp.venue) {
    const parts = [comp.venue.fullName || ''];
    const city = comp.venue.address?.city || '';
    if (city) parts.push(city);
    venue = parts.filter(Boolean).join(', ');
  }

  return {
    id: event.id || '',
    league,
    gameDate: (event.date || '').slice(0, 10),
    name: event.name || '',
    shortName: event.shortName || '',
    status,
    period: statusObj.period,
    clock: statusObj.displayClock,
    date: event.date || '',
    awayAbbr: awayTeam.abbreviation || '???',
    homeAbbr: homeTeam.abbreviation || '???',
    awayId: awayTeam.id || null,
    homeId: homeTeam.id || null,
    awayName: awayTeam.displayName || '',
    homeName: homeTeam.displayName || '',
    awayColor: '#' + (awayTeam.color || '555555'),
    homeColor: '#' + (homeTeam.color || '555555'),
    awayScore: parseInt(away.score || 0, 10),
    homeScore: parseInt(home.score || 0, 10),
    network,
    venue,
    mom: null,
  };
}

function getPlaysFromSummary(summary) {
  if (!summary) return [];
  if (summary.plays?.length) return summary.plays;
  if (summary.playByPlay?.plays?.length) return summary.playByPlay.plays;
  return [];
}

module.exports = {
  fetchJSON,
  fetchNbaScoreboard,
  fetchCbbScoreboard,
  fetchGameSummary,
  parseScoreboardEvent,
  getPlaysFromSummary,
};
