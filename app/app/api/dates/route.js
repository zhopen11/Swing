/** /api/dates — returns distinct game dates from team_mvix for the date picker. */

import { sql } from '../../../lib/db';

export const dynamic = 'force-dynamic';

let cachedDates = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
    const dates = result.rows.map((r) => r.game_date.toISOString().slice(0, 10));
    cachedDates = { dates };
    cacheTimestamp = now;

    return Response.json(cachedDates);
  } catch (err) {
    console.error('Dates endpoint error:', err);
    return Response.json({ dates: [] }, { status: 500 });
  }
}
