// app/scripts/sr-nhl-cache.js
// Usage: SPORTRADAR_NHL_KEY=<key> node app/scripts/sr-nhl-cache.js
//        SPORTRADAR_NHL_KEY=<key> node app/scripts/sr-nhl-cache.js --ids "id1,id2,id3"
//        SPORTRADAR_NHL_KEY=<key> node app/scripts/sr-nhl-cache.js --date 2026-04-19

const fs   = require('fs');
const path = require('path');
const nhl  = require('../lib/sportradar-nhl');

const CACHE_DIR = path.join(__dirname, '../../data/sr-nhl-cache');

// 10 recent playoff games (Apr 19–20, 2026) — first round Game 1s and 2s
// Add more IDs here as you collect them
const DEFAULT_GAME_IDS = [
  'cf86449d-f28f-4266-b16b-4e6adb740b1d', // LA @ COL Apr 19
  '3797062a-1a58-443d-b09e-ea103df7d14a', // MTL @ TB  Apr 19
  '5e48fd98-2f83-4ae5-9f87-de1975374df2', // BOS @ BUF Apr 19
  'c6d47cd5-4564-4dc7-aa2e-ff46de661af1', // UTA @ VGK Apr 19
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cacheGame(gameId) {
  const dest = path.join(CACHE_DIR, `${gameId}.json`);
  if (fs.existsSync(dest)) {
    console.log(`  skip (cached): ${gameId}`);
    return;
  }
  console.log(`  fetching: ${gameId}`);
  const pbp = await nhl.fetchPbp(gameId);
  fs.writeFileSync(dest, JSON.stringify(pbp));
  console.log(`  saved: ${dest}`);
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const args = process.argv.slice(2);

  let gameIds = DEFAULT_GAME_IDS;

  if (args.includes('--ids')) {
    gameIds = args[args.indexOf('--ids') + 1].split(',').map(s => s.trim());
  } else if (args.includes('--date')) {
    const date = args[args.indexOf('--date') + 1];
    console.log(`Fetching schedule for ${date}...`);
    const sched = await nhl.fetchDailySchedule(date);
    await sleep(nhl.SR_DELAY);
    const games = sched.games || sched.day?.games || [];
    gameIds = games.filter(g => g.status === 'closed' || g.status === 'complete').map(g => g.id);
    console.log(`Found ${gameIds.length} completed games`);
  }

  console.log(`\nCaching ${gameIds.length} games to ${CACHE_DIR}/`);
  for (const id of gameIds) {
    await sleep(nhl.SR_DELAY);
    try {
      await cacheGame(id);
    } catch (err) {
      console.error(`  ERROR ${id}: ${err.message}`);
    }
  }
  const cached = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  console.log(`\nDone. ${cached.length} total games in cache.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
