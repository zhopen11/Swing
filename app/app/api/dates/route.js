/** /api/dates — returns distinct game dates from team_mvix for the date picker. */

import { sql } from '../../../lib/db';

export const dynamic = 'force-dynamic';

let cachedDates = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Returns "YYYY-MM-DD" for N days ago in Eastern Time */
function etDateOffset(daysAgo) {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  et.setDate(et.getDate() - daysAgo);
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
}

export async function GET() {
  try {
    const now = Date.now();
    if (cachedDates && now - cacheTimestamp < CACHE_TTL) {
      return Response.json(cachedDates);
    }

    const result = await sql`
      SELECT DISTINCT game_date
      FROM team_mvix
      ORDER BY game_date DESC
    `;

    // Return as array of "YYYY-MM-DD" strings
    const dbDates = result.rows.map((r) => r.game_date.toISOString().slice(0, 10));

    // Always include the last 3 days so yesterday/today are selectable even if
    // MVIX recording didn't run (e.g. server was down, games not yet finalized).
    const recentDates = [etDateOffset(2), etDateOffset(1), etDateOffset(0)];
    const dateSet = new Set([...dbDates, ...recentDates]);
    const dates = [...dateSet].sort().reverse();

    cachedDates = { dates };
    cacheTimestamp = now;

    return Response.json(cachedDates);
  } catch (err) {
    console.error('Dates endpoint error:', err);
    return Response.json({ dates: [] }, { status: 500 });
  }
}
