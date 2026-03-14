import { NextResponse } from 'next/server';
import db from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const database = db.initDb();
  const { searchParams } = new URL(request.url);

  let query = `SELECT g.*, gm.final_away_mom, gm.final_home_mom
    FROM games g LEFT JOIN game_momentum gm ON g.game_id = gm.game_id WHERE 1=1`;
  const params = [];

  const date = searchParams.get('date');
  if (date) {
    query += ' AND g.game_date = ?';
    params.push(date);
  }

  const league = searchParams.get('league');
  if (league) {
    query += ' AND g.league = ?';
    params.push(league.toUpperCase());
  }

  const status = searchParams.get('status');
  if (status) {
    query += ' AND g.status = ?';
    params.push(status);
  }

  query += ' ORDER BY g.game_date DESC, g.updated_at DESC';

  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
  query += ' LIMIT ?';
  params.push(limit);

  const rows = database.prepare(query).all(...params);
  return NextResponse.json(rows);
}
