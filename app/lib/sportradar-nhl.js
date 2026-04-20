/** The Swing — Sportradar NHL client. Same shape as sportradar.js (NCAAB). */

const { createClient } = require('./sportradar');

module.exports = createClient({
  base: 'https://api.sportradar.com/nhl/trial/v7/en',
  envKey: 'SPORTRADAR_NHL_KEY',
});
