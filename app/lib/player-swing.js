/** DB access layer for player swing impact data. */

import { sql } from './db.js';

const ROLLING_WINDOW = 10;

/**
 * Record swing impact for all players in a team's game.
 */
export async function recordPlayerSwingImpact(gameId, gameDate, league, team, leaderboard, inflectionCounts, conferenceId, conferenceName) {
  for (const player of leaderboard) {
    await sql`
      INSERT INTO player_swing_impact (
        game_id, game_date, league, team, athlete_id, player_name,
        total_impact, swing_appearances, positive_plays, negative_plays, efficiency,
        total_swings, up_swings, down_swings,
        conference_id, conference, weighted_impact, clutch_appearances, jersey,
        mvix, mrvi, combo
      ) VALUES (
        ${gameId}, ${gameDate}, ${league}, ${team}, ${player.athleteId},
        ${player.player}, ${player.totalImpact}, ${player.swingAppearances},
        ${player.positivePlays}, ${player.negativePlays}, ${player.efficiency},
        ${inflectionCounts.total}, ${inflectionCounts.up}, ${inflectionCounts.down},
        ${conferenceId || null}, ${conferenceName || null},
        ${player.weightedImpact || 0}, ${player.clutchAppearances || 0}, ${player.jersey || null},
        ${player.mvix ?? null}, ${player.mrvi ?? null}, ${player.combo ?? null}
      )
      ON CONFLICT (game_id, team, player_name) DO UPDATE SET
        athlete_id = COALESCE(EXCLUDED.athlete_id, player_swing_impact.athlete_id),
        total_impact = EXCLUDED.total_impact,
        swing_appearances = EXCLUDED.swing_appearances,
        positive_plays = EXCLUDED.positive_plays,
        negative_plays = EXCLUDED.negative_plays,
        efficiency = EXCLUDED.efficiency,
        total_swings = EXCLUDED.total_swings,
        up_swings = EXCLUDED.up_swings,
        down_swings = EXCLUDED.down_swings,
        conference_id = COALESCE(EXCLUDED.conference_id, player_swing_impact.conference_id),
        conference = COALESCE(EXCLUDED.conference, player_swing_impact.conference),
        weighted_impact = EXCLUDED.weighted_impact,
        clutch_appearances = EXCLUDED.clutch_appearances,
        jersey = COALESCE(EXCLUDED.jersey, player_swing_impact.jersey),
        mvix = EXCLUDED.mvix,
        mrvi = EXCLUDED.mrvi,
        combo = EXCLUDED.combo
    `;

    // Compute and write rolling MVIX/MRVI from the last N games for this player
    if (player.mvix != null) {
      const { rows: recent } = await sql`
        SELECT mvix, mrvi, combo
        FROM player_swing_impact
        WHERE player_name = ${player.player}
          AND team = ${team}
          AND league = ${league}
          AND mvix IS NOT NULL
        ORDER BY game_date DESC
        LIMIT ${ROLLING_WINDOW}
      `;
      if (recent.length > 0) {
        const rollingMvix = recent.reduce((s, r) => s + r.mvix, 0) / recent.length;
        const mrviRows = recent.filter((r) => r.mrvi != null);
        const rollingMrvi = mrviRows.length > 0
          ? mrviRows.reduce((s, r) => s + r.mrvi, 0) / mrviRows.length
          : null;
        const comboRows = recent.filter((r) => r.combo != null);
        const rollingCombo = comboRows.length > 0
          ? comboRows.reduce((s, r) => s + r.combo, 0) / comboRows.length
          : null;
        await sql`
          UPDATE player_swing_impact
          SET rolling_mvix  = ${Math.round(rollingMvix * 100) / 100},
              rolling_mrvi  = ${rollingMrvi  != null ? Math.round(rollingMrvi  * 100) / 100 : null},
              rolling_combo = ${rollingCombo != null ? Math.round(rollingCombo * 100) / 100 : null}
          WHERE game_id    = ${gameId}
            AND team       = ${team}
            AND player_name = ${player.player}
        `;
      }
    }
  }
}

/**
 * Check if swing impact has already been recorded for a game.
 */
export async function hasSwingImpact(gameId) {
  const { rows } = await sql`
    SELECT 1 FROM player_swing_impact WHERE game_id = ${gameId} LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Get top swingers for a team from recent games, excluding a specific game.
 * Adjusts weighted impact by conference strength factor.
 */
export async function getRecentTeamSwingers(team, league, excludeGameId, limit = 3) {
  // Get conference strength for this team (most recent entry)
  const { rows: confRows } = await sql`
    SELECT conf_strength FROM team_mvix
    WHERE team = ${team} AND league = ${league} AND conf_strength IS NOT NULL
    ORDER BY game_date DESC LIMIT 1
  `;
  const confStrength = confRows[0]?.conf_strength ?? 1;

  const { rows } = await sql`
    SELECT player_name AS "player",
           athlete_id AS "athleteId",
           jersey,
           COUNT(*) AS "gamesPlayed",
           ROUND(AVG(COALESCE(weighted_impact, total_impact))::numeric, 1) AS "avgWeightedImpact",
           ROUND(AVG(efficiency)::numeric, 1) AS "avgEfficiency",
           SUM(CASE WHEN COALESCE(clutch_appearances, 0) > 0 THEN 1 ELSE 0 END)::integer AS "clutchGames"
    FROM player_swing_impact
    WHERE team = ${team}
      AND league = ${league}
      AND game_id != ${excludeGameId}
    GROUP BY player_name, athlete_id, jersey
    HAVING COUNT(*) >= 1
    ORDER BY AVG(COALESCE(weighted_impact, total_impact)) DESC
    LIMIT ${limit}
  `;

  // Apply conference strength adjustment
  return rows.map(r => ({
    ...r,
    avgWeightedImpact: Math.round(Number(r.avgWeightedImpact) * confStrength * 10) / 10,
    rawAvgWeightedImpact: Number(r.avgWeightedImpact),
    confStrength,
  }));
}

/**
 * Get aggregated player swing impact across games for a team.
 */
export async function getTeamPlayerImpact(team, league, limit = 20) {
  const { rows } = await sql`
    SELECT player_name AS "player",
           athlete_id AS "athleteId",
           COUNT(*) AS "gamesPlayed",
           SUM(total_impact) AS "cumulativeImpact",
           ROUND(AVG(total_impact)::numeric, 1) AS "avgImpactPerGame",
           SUM(swing_appearances) AS "totalSwingAppearances",
           SUM(positive_plays) AS "totalPositive",
           SUM(negative_plays) AS "totalNegative",
           ROUND(AVG(efficiency)::numeric, 1) AS "avgEfficiency"
    FROM player_swing_impact
    WHERE team = ${team} AND league = ${league}
    GROUP BY player_name, athlete_id
    ORDER BY SUM(total_impact) DESC
    LIMIT ${limit}
  `;
  return rows;
}

/**
 * Get a specific player's game-by-game swing impact history.
 */
export async function getPlayerHistory(playerName, league, limit = 20) {
  const { rows } = await sql`
    SELECT game_id AS "gameId", game_date AS "gameDate", team, league,
           total_impact AS "totalImpact", swing_appearances AS "swingAppearances",
           positive_plays AS "positivePlays", negative_plays AS "negativePlays",
           efficiency, total_swings AS "totalSwings",
           up_swings AS "upSwings", down_swings AS "downSwings"
    FROM player_swing_impact
    WHERE player_name = ${playerName} AND league = ${league}
    ORDER BY game_date DESC
    LIMIT ${limit}
  `;
  return rows;
}

/**
 * Get top swing impact players across all teams in a league.
 */
/**
 * Get top swingers per conference for a given week (Mon–Sun).
 */
export async function getWeeklySwingersbyConference(weekStart, weekEnd, conferenceName = null) {
  if (conferenceName) {
    const { rows } = await sql`
      SELECT player_name AS "player",
             athlete_id AS "athleteId",
             jersey,
             team,
             conference,
             COUNT(*) AS "gamesPlayed",
             ROUND(AVG(COALESCE(weighted_impact, total_impact))::numeric, 1) AS "avgWeightedImpact",
             ROUND(SUM(COALESCE(weighted_impact, total_impact))::numeric, 1) AS "totalWeightedImpact",
             ROUND(AVG(efficiency)::numeric, 1) AS "avgEfficiency",
             SUM(CASE WHEN COALESCE(clutch_appearances, 0) > 0 THEN 1 ELSE 0 END)::integer AS "clutchGames"
      FROM player_swing_impact
      WHERE league = 'CBB'
        AND game_date >= ${weekStart}
        AND game_date <= ${weekEnd}
        AND conference = ${conferenceName}
      GROUP BY player_name, athlete_id, jersey, team, conference
      ORDER BY AVG(COALESCE(weighted_impact, total_impact)) DESC
    `;
    return rows;
  }

  const { rows } = await sql`
    SELECT player_name AS "player",
           athlete_id AS "athleteId",
           jersey,
           team,
           conference,
           COUNT(*) AS "gamesPlayed",
           ROUND(AVG(COALESCE(weighted_impact, total_impact))::numeric, 1) AS "avgWeightedImpact",
           ROUND(SUM(COALESCE(weighted_impact, total_impact))::numeric, 1) AS "totalWeightedImpact",
           ROUND(AVG(efficiency)::numeric, 1) AS "avgEfficiency",
           SUM(CASE WHEN COALESCE(clutch_appearances, 0) > 0 THEN 1 ELSE 0 END)::integer AS "clutchGames"
    FROM player_swing_impact
    WHERE league = 'CBB'
      AND game_date >= ${weekStart}
      AND game_date <= ${weekEnd}
      AND conference IS NOT NULL
    GROUP BY player_name, athlete_id, jersey, team, conference
    ORDER BY AVG(COALESCE(weighted_impact, total_impact)) DESC
  `;
  return rows;
}

export async function getLeagueLeaderboard(league, minGames = 5, limit = 25) {
  const { rows } = await sql`
    SELECT player_name AS "player",
           athlete_id AS "athleteId",
           team,
           COUNT(*) AS "gamesPlayed",
           SUM(total_impact) AS "cumulativeImpact",
           ROUND(AVG(total_impact)::numeric, 1) AS "avgImpactPerGame",
           SUM(positive_plays) AS "totalPositive",
           SUM(negative_plays) AS "totalNegative",
           ROUND(AVG(efficiency)::numeric, 1) AS "avgEfficiency"
    FROM player_swing_impact
    WHERE league = ${league}
    GROUP BY player_name, athlete_id, team
    HAVING COUNT(*) >= ${minGames}
    ORDER BY AVG(total_impact) DESC
    LIMIT ${limit}
  `;
  return rows;
}
