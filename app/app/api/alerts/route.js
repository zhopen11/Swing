import { NextResponse } from 'next/server';
import { sql } from '../../../lib/db';

export const dynamic = 'force-dynamic';

function toAlertType(dbType) {
  if (dbType === 'swingWarning') return 'swing-warning';
  return dbType;
}

function rowToAlert(row) {
  return {
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
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const typeParam = searchParams.get('type');
  const dbType = typeParam === 'swing-warning' ? 'swingWarning' : typeParam;

  try {
    let rows;
    if (dateParam && dbType) {
      ({ rows } = await sql`
        SELECT * FROM alert_logs
        WHERE DATE(created_at AT TIME ZONE 'America/New_York') = ${dateParam}
          AND alert_type = ${dbType}
        ORDER BY created_at DESC
      `);
    } else if (dateParam) {
      ({ rows } = await sql`
        SELECT * FROM alert_logs
        WHERE DATE(created_at AT TIME ZONE 'America/New_York') = ${dateParam}
        ORDER BY created_at DESC
      `);
    } else if (dbType) {
      ({ rows } = await sql`
        SELECT * FROM alert_logs
        WHERE DATE(created_at AT TIME ZONE 'America/New_York') = CURRENT_DATE AT TIME ZONE 'America/New_York'
          AND alert_type = ${dbType}
        ORDER BY created_at DESC
      `);
    } else {
      ({ rows } = await sql`
        SELECT * FROM alert_logs
        WHERE DATE(created_at AT TIME ZONE 'America/New_York') = CURRENT_DATE AT TIME ZONE 'America/New_York'
        ORDER BY created_at DESC
      `);
    }
    return NextResponse.json(rows.map(rowToAlert));
  } catch (err) {
    console.error('[/api/alerts] error:', err);
    return NextResponse.json([], { status: 500 });
  }
}
