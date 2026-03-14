import { NextResponse } from 'next/server';
import db from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const database = db.initDb();

  const stats = database
    .prepare(
      `SELECT
         COUNT(*) as total_games,
         SUM(total_alerts) as total_alerts,
         SUM(bluffing_count) as bluffing_alerts,
         SUM(comeback_count) as comeback_alerts,
         SUM(swing_warn_count) as swing_warning_alerts,
         SUM(bluff_correct) as bluff_correct,
         SUM(bluff_total) as bluff_total,
         SUM(comeback_correct) as comeback_correct,
         SUM(comeback_total) as comeback_total
       FROM backfill_log`,
    )
    .get();

  if (stats.bluff_total > 0) {
    stats.bluff_accuracy = Math.round((stats.bluff_correct / stats.bluff_total) * 1000) / 10;
  } else {
    stats.bluff_accuracy = null;
  }

  if (stats.comeback_total > 0) {
    stats.comeback_accuracy =
      Math.round((stats.comeback_correct / stats.comeback_total) * 1000) / 10;
  } else {
    stats.comeback_accuracy = null;
  }

  return NextResponse.json(stats);
}
