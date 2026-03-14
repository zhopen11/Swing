import { NextResponse } from 'next/server';
import db from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const database = db.initDb();

  const games = database
    .prepare(
      `SELECT g.*, gm.final_away_mom, gm.final_home_mom
       FROM games g LEFT JOIN game_momentum gm ON g.game_id = gm.game_id
       WHERE g.status IN ('STATUS_IN_PROGRESS', 'STATUS_HALFTIME')
       ORDER BY g.league, g.away_abbr`,
    )
    .all();

  const results = games.map((game) => {
    const chart = database
      .prepare(
        `SELECT away_momentum, home_momentum, period, clock, wallclock, home_score, away_score
         FROM momentum_snapshots WHERE game_id = ? ORDER BY snapshot_index`,
      )
      .all(game.game_id);

    const recentPlays = database
      .prepare('SELECT * FROM plays WHERE game_id = ? ORDER BY play_index DESC LIMIT 8')
      .all(game.game_id);

    const activeAlerts = database
      .prepare('SELECT alert_type FROM alerts WHERE game_id = ? ORDER BY detected_at DESC LIMIT 1')
      .all(game.game_id);

    return { ...game, chart, recent_plays: recentPlays, active_alerts: activeAlerts };
  });

  return NextResponse.json(results);
}
