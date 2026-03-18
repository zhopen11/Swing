import { sql } from './db.js';

export async function logAlert(game, alertType) {
  await sql`
    INSERT INTO alert_logs (
      game_id, alert_type, period, clock,
      away_abbr, home_abbr, away_score, home_score,
      away_momentum, home_momentum,
      away_mvix, home_mvix, away_bias, home_bias,
      away_mrvi, home_mrvi,
      away_rolling3_mvix, home_rolling3_mvix,
      away_rolling3_mrvi, home_rolling3_mrvi
    ) VALUES (
      ${game.id}, ${alertType}, ${game.period}, ${game.clock},
      ${game.awayAbbr}, ${game.homeAbbr},
      ${game.awayScore}, ${game.homeScore},
      ${Math.round(game.mom?.away)}, ${Math.round(game.mom?.home)},
      ${game.mvixAway?.mvix ?? null}, ${game.mvixHome?.mvix ?? null},
      ${game.mvixAway?.bias ?? null}, ${game.mvixHome?.bias ?? null},
      ${game.mvixAway?.mrvi ?? null}, ${game.mvixHome?.mrvi ?? null},
      ${game.rolling3Away?.mvix ?? null}, ${game.rolling3Home?.mvix ?? null},
      ${game.rolling3Away?.mrvi ?? null}, ${game.rolling3Home?.mrvi ?? null}
    )
    ON CONFLICT (game_id, alert_type, period, clock) DO NOTHING
  `;
}

export async function getAlertLogs(gameId) {
  const { rows } = await sql`
    SELECT * FROM alert_logs
    WHERE game_id = ${gameId}
    ORDER BY created_at DESC
  `;
  return rows;
}
