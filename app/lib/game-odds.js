/** DB access layer for pregame odds — captured once, never updated. */

import { sql } from './db.js';

/**
 * Store pregame odds for a game. No-op if odds already exist for this game.
 */
export async function captureGameOdds(gameId, odds) {
  if (!odds || (!odds.details && odds.overUnder == null)) return;
  await sql`
    INSERT INTO game_odds (game_id, details, spread, over_under, provider)
    VALUES (${gameId}, ${odds.details || null}, ${odds.spread ?? null}, ${odds.overUnder ?? null}, ${odds.provider || null})
    ON CONFLICT (game_id) DO NOTHING
  `;
}

/**
 * Get stored pregame odds for a game. Returns null if not captured yet.
 */
export async function getGameOdds(gameId) {
  const { rows } = await sql`
    SELECT details, spread, over_under AS "overUnder", provider
    FROM game_odds WHERE game_id = ${gameId}
  `;
  return rows[0] || null;
}

/**
 * Get stored pregame odds for multiple games at once.
 */
export async function getGameOddsBatch(gameIds) {
  if (!gameIds.length) return {};
  const { rows } = await sql`
    SELECT game_id AS "gameId", details, spread, over_under AS "overUnder", provider
    FROM game_odds WHERE game_id = ANY(${gameIds})
  `;
  const map = {};
  rows.forEach(r => { map[r.gameId] = { details: r.details, spread: r.spread, overUnder: r.overUnder, provider: r.provider }; });
  return map;
}
