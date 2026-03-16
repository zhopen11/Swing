/**
 * /api/mvix/sync
 *
 * GET  — Export all team_mvix records as JSON (for backing up or syncing to another environment)
 * POST — Import team_mvix records from JSON payload (upserts, safe to re-run)
 *
 * Usage:
 *   Export from dev:  curl http://localhost:3001/api/mvix/sync > mvix-data.json
 *   Import to prod:   curl -X POST https://prod-url/api/mvix/sync -H "Content-Type: application/json" -d @mvix-data.json
 */

import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { rows } = await sql`
      SELECT team, league, game_id AS "gameId",
             game_date::text AS "gameDate", won, score,
             mvix, mvix_up AS "mvixUp", mvix_down AS "mvixDown", bias,
             up_inflections AS "upInflections", down_inflections AS "downInflections",
             avg_up_magnitude AS "avgUpMagnitude", avg_down_magnitude AS "avgDownMagnitude",
             rolling_avg_up_magnitude AS "rollingAvgUpMagnitude", rolling_mvix AS "rollingMvix",
             mrvi, combo, conf, conf_strength AS "confStrength",
             adj_mvix AS "adjMvix", adj_mrvi AS "adjMrvi",
             games_in_rolling AS "gamesInRolling"
      FROM team_mvix
      ORDER BY game_date ASC, team ASC
    `;

    return NextResponse.json({
      count: rows.length,
      exportedAt: new Date().toISOString(),
      records: rows,
    });
  } catch (err) {
    console.error('MVIX sync export error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const records = body.records || body;

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'No records provided' }, { status: 400 });
    }

    let imported = 0;
    let errors = 0;

    for (const r of records) {
      try {
        await sql`
          INSERT INTO team_mvix (
            team, league, game_id, game_date, won, score,
            mvix, mvix_up, mvix_down, bias,
            up_inflections, down_inflections,
            avg_up_magnitude, avg_down_magnitude,
            rolling_avg_up_magnitude, rolling_mvix,
            mrvi, combo, conf, conf_strength, adj_mvix, adj_mrvi,
            games_in_rolling
          ) VALUES (
            ${r.team}, ${r.league}, ${r.gameId}, ${r.gameDate}, ${r.won}, ${r.score},
            ${r.mvix}, ${r.mvixUp}, ${r.mvixDown}, ${r.bias},
            ${r.upInflections}, ${r.downInflections},
            ${r.avgUpMagnitude}, ${r.avgDownMagnitude},
            ${r.rollingAvgUpMagnitude ?? null}, ${r.rollingMvix ?? null},
            ${r.mrvi ?? null}, ${r.combo ?? null},
            ${r.conf ?? null}, ${r.confStrength ?? null},
            ${r.adjMvix ?? null}, ${r.adjMrvi ?? null},
            ${r.gamesInRolling ?? 1}
          )
          ON CONFLICT (team, game_id) DO UPDATE SET
            won = EXCLUDED.won,
            score = EXCLUDED.score,
            mvix = EXCLUDED.mvix,
            mvix_up = EXCLUDED.mvix_up,
            mvix_down = EXCLUDED.mvix_down,
            bias = EXCLUDED.bias,
            up_inflections = EXCLUDED.up_inflections,
            down_inflections = EXCLUDED.down_inflections,
            avg_up_magnitude = EXCLUDED.avg_up_magnitude,
            avg_down_magnitude = EXCLUDED.avg_down_magnitude,
            rolling_avg_up_magnitude = EXCLUDED.rolling_avg_up_magnitude,
            rolling_mvix = EXCLUDED.rolling_mvix,
            mrvi = EXCLUDED.mrvi,
            combo = EXCLUDED.combo,
            conf = EXCLUDED.conf,
            conf_strength = EXCLUDED.conf_strength,
            adj_mvix = EXCLUDED.adj_mvix,
            adj_mrvi = EXCLUDED.adj_mrvi,
            games_in_rolling = EXCLUDED.games_in_rolling
        `;
        imported++;
      } catch (err) {
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      errors,
      total: records.length,
    });
  } catch (err) {
    console.error('MVIX sync import error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
