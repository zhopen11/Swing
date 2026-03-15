import { sql } from './db.js';

const ROLLING_WINDOW = 10;

/**
 * Get the last N MVIX entries for a team (most recent first).
 */
export async function getTeamHistory(team, league, limit = ROLLING_WINDOW) {
  const { rows } = await sql`
    SELECT team, league, game_id AS "gameId", game_date AS "gameDate", won, score,
           mvix, mvix_up AS "mvixUp", mvix_down AS "mvixDown", bias,
           up_inflections AS "upInflections", down_inflections AS "downInflections",
           avg_up_magnitude AS "avgUpMagnitude", avg_down_magnitude AS "avgDownMagnitude",
           rolling_avg_up_magnitude AS "rollingAvgUpMagnitude", rolling_mvix AS "rollingMvix",
           games_in_rolling AS "gamesInRolling", created_at AS "createdAt"
    FROM team_mvix
    WHERE team = ${team} AND league = ${league}
    ORDER BY game_date DESC
    LIMIT ${limit}
  `;
  return rows;
}

/**
 * Get the current rolling MVIX for a team (computed from last N games).
 */
export async function getTeamRolling(team, league) {
  const history = await getTeamHistory(team, league, ROLLING_WINDOW);
  if (history.length === 0) return null;

  const n = history.length;
  const avgMvix = history.reduce((s, h) => s + h.mvix, 0) / n;
  const avgUp = history.reduce((s, h) => s + h.avgUpMagnitude, 0) / n;
  const avgBias = history.reduce((s, h) => s + h.bias, 0) / n;
  const avgUpI = history.reduce((s, h) => s + h.upInflections, 0) / n;
  const avgDnI = history.reduce((s, h) => s + h.downInflections, 0) / n;

  return {
    team,
    league,
    gamesInRolling: n,
    rollingMvix: Math.round(avgMvix * 100) / 100,
    rollingAvgUpMagnitude: Math.round(avgUp * 100) / 100,
    rollingBias: Math.round(avgBias * 100) / 100,
    rollingUpInflections: Math.round(avgUpI * 100) / 100,
    rollingDownInflections: Math.round(avgDnI * 100) / 100,
    lastGameDate: history[0].gameDate,
  };
}

/**
 * Check if a game has already been recorded for a team.
 */
export async function hasGameRecord(team, gameId) {
  const { rows } = await sql`
    SELECT 1 FROM team_mvix WHERE team = ${team} AND game_id = ${gameId}
  `;
  return rows.length > 0;
}

/**
 * Record a team's MVIX for a completed game.
 * Computes rolling averages from the last N games including this one.
 */
export async function recordGameMvix(team, league, gameId, gameDate, won, score, vol) {
  // Get prior history to compute rolling values
  const prior = await getTeamHistory(team, league, ROLLING_WINDOW - 1);

  const allMvix = [vol.mvix, ...prior.map((h) => h.mvix)];
  const allAvgUp = [vol.avgUpMagnitude, ...prior.map((h) => h.avgUpMagnitude)];
  const n = allMvix.length;

  const rollingMvix = allMvix.reduce((a, b) => a + b, 0) / n;
  const rollingAvgUp = allAvgUp.reduce((a, b) => a + b, 0) / n;

  await sql`
    INSERT INTO team_mvix (
      team, league, game_id, game_date, won, score,
      mvix, mvix_up, mvix_down, bias,
      up_inflections, down_inflections,
      avg_up_magnitude, avg_down_magnitude,
      rolling_avg_up_magnitude, rolling_mvix, games_in_rolling
    ) VALUES (
      ${team}, ${league}, ${gameId}, ${gameDate}, ${won}, ${score},
      ${vol.mvix}, ${vol.mvixUp}, ${vol.mvixDown}, ${vol.bias},
      ${vol.upInflections}, ${vol.downInflections},
      ${vol.avgUpMagnitude}, ${vol.avgDownMagnitude},
      ${Math.round(rollingAvgUp * 100) / 100},
      ${Math.round(rollingMvix * 100) / 100},
      ${n}
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
      games_in_rolling = EXCLUDED.games_in_rolling
  `;

  return {
    team,
    league,
    rollingMvix: Math.round(rollingMvix * 100) / 100,
    rollingAvgUpMagnitude: Math.round(rollingAvgUp * 100) / 100,
    gamesInRolling: n,
  };
}

/**
 * Get rolling MVIX for all teams (for leaderboard/comparison).
 */
export async function getAllTeamRollings(league) {
  const { rows } = await sql`
    SELECT DISTINCT ON (team) team, league, rolling_mvix AS "rollingMvix",
           rolling_avg_up_magnitude AS "rollingAvgUpMagnitude",
           games_in_rolling AS "gamesInRolling", game_date AS "lastGameDate"
    FROM team_mvix
    WHERE league = ${league}
    ORDER BY team, game_date DESC
  `;
  return rows;
}
