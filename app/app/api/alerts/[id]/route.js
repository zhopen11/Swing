import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

function toAlertType(dbType) {
  if (dbType === 'swingWarning') return 'swing-warning';
  return dbType;
}

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const { rows } = await sql`SELECT * FROM alert_logs WHERE id = ${id} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const row = rows[0];
    return NextResponse.json({
      id: row.id,
      gameId: row.game_id,
      type: toAlertType(row.alert_type),
      firedAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
      gameClock: row.clock ?? '',
      period: row.period != null ? String(row.period) : '',
      swingers: [
        row.away_abbr ? {
          playerId: '', name: row.away_abbr, position: '',
          team: { abbr: row.away_abbr, name: row.away_abbr, fullName: row.away_abbr, league: 'NBA' },
          swingScore: row.away_momentum ?? 0, rank: 1,
        } : null,
        row.home_abbr ? {
          playerId: '', name: row.home_abbr, position: '',
          team: { abbr: row.home_abbr, name: row.home_abbr, fullName: row.home_abbr, league: 'NBA' },
          swingScore: row.home_momentum ?? 0, rank: 2,
        } : null,
      ].filter(Boolean),
    });
  } catch (err) {
    console.error(`[/api/alerts/${id}] error:`, err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
