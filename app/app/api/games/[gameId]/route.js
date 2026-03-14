import { NextResponse } from 'next/server';
import db from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { gameId } = await params;
  const database = db.initDb();

  const game = database
    .prepare(
      `SELECT g.*, gm.final_away_mom, gm.final_home_mom, gm.total_plays, gm.total_teamed
       FROM games g LEFT JOIN game_momentum gm ON g.game_id = gm.game_id
       WHERE g.game_id = ?`,
    )
    .get(gameId);

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });

  const recentPlays = database
    .prepare('SELECT * FROM plays WHERE game_id = ? ORDER BY play_index DESC LIMIT 8')
    .all(gameId);

  game.recent_plays = recentPlays;
  return NextResponse.json(game);
}
