import { NextResponse } from 'next/server';
import db from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const database = db.initDb();
  const { searchParams } = new URL(request.url);

  let query = `SELECT a.*, g.away_abbr, g.home_abbr, g.league, g.short_name
    FROM alerts a JOIN games g ON a.game_id = g.game_id WHERE 1=1`;
  const params = [];

  const alertType = searchParams.get('type');
  if (alertType) {
    query += ' AND a.alert_type = ?';
    params.push(alertType.toUpperCase());
  }

  const date = searchParams.get('date');
  if (date) {
    query += ' AND g.game_date = ?';
    params.push(date);
  }

  query += ' ORDER BY a.detected_at DESC LIMIT 100';

  const rows = database.prepare(query).all(...params);
  return NextResponse.json(rows);
}
