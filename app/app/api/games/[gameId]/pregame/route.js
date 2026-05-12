import { NextResponse } from 'next/server';
import { sql } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://the-swing.vercel.app';

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

async function buildTeamStats(abbr, league, currentGameId) {
  const mvixResult = await sql`
    SELECT game_id, game_date, won, score, mvix FROM team_mvix
    WHERE team = ${abbr} AND league = ${league} AND game_id != ${currentGameId}
    ORDER BY game_date DESC LIMIT 10
  `;
  const rows = mvixResult.rows ?? [];
  if (!rows.length) return undefined;

  const mvixValues = rows.map((r) => r.mvix ?? 0);
  const avgMomentum = Math.round(mvixValues.reduce((a, b) => a + b, 0) / mvixValues.length);
  const avgMomentumDelta = mvixValues.length >= 2 ? mvixValues[0] - mvixValues[1] : 0;
  const sd = stdDev(mvixValues);

  const swingResult = await sql`
    SELECT player_name, total_impact FROM player_swing_impact
    WHERE team = ${abbr} AND league = ${league}
    ORDER BY game_date DESC LIMIT 50
  `;
  const playerMap = {};
  for (const row of swingResult.rows ?? []) {
    if (!playerMap[row.player_name]) playerMap[row.player_name] = { total: 0, count: 0 };
    playerMap[row.player_name].total += row.total_impact ?? 0;
    playerMap[row.player_name].count += 1;
  }
  const topSwingers = Object.entries(playerMap)
    .map(([name, d]) => ({ name, avg: d.total / d.count }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3)
    .map((p, i) => ({ name: p.name, position: '', contribution: Math.round(p.avg), rank: i + 1 }));

  const last5 = rows.slice(0, 5);
  const gameIds = last5.map((r) => r.game_id);
  let oddsMap = {};
  if (gameIds.length) {
    const oddsResult = await sql`
      SELECT game_id, details, spread FROM game_odds WHERE game_id = ANY(${gameIds})
    `;
    for (const o of oddsResult.rows ?? []) oddsMap[o.game_id] = o;
  }

  const recentForm = last5.map((row) => {
    const result = row.won ? 'W' : 'L';
    const odds = oddsMap[row.game_id];
    if (!odds?.spread || !row.score) return { result, ats: 'P' };
    const parts = row.score.split('-').map(Number);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) return { result, ats: 'P' };
    const margin = parts[0] - parts[1];
    let spread = odds.spread;
    if (odds.details) {
      const detailTeam = odds.details.trim().split(/\s+/)[0];
      if (detailTeam.toUpperCase() !== abbr.toUpperCase()) spread = -spread;
    }
    const covered = margin + spread;
    return { result, ats: covered > 0 ? 'W' : covered < 0 ? 'L' : 'P' };
  });

  return {
    team: { abbr, name: abbr, fullName: abbr, league },
    avgMomentum,
    avgMomentumDelta,
    mvix: mvixValues[0],
    mvixDelta: avgMomentumDelta,
    mvixTrend: sd < 15 ? 'TRENDING STEADY' : 'TRENDING CHAOTIC',
    mvixSparkline: [...mvixValues].reverse(),
    topSwingers,
    recentForm,
  };
}

export async function GET(request, { params }) {
  const { gameId } = await params;
  try {
    const pollRes = await fetch(`${BASE_URL}/api/poll`, { next: { revalidate: 0 } });
    if (!pollRes.ok) return NextResponse.json({ error: 'upstream error' }, { status: pollRes.status });
    const { games: rawGames = [] } = await pollRes.json();
    const game = rawGames.find((g) => g.id === gameId);
    if (!game) return NextResponse.json({ error: 'game not found' }, { status: 404 });

    const [away, home] = await Promise.all([
      buildTeamStats(game.awayAbbr, game.league, gameId),
      buildTeamStats(game.homeAbbr, game.league, gameId),
    ]);

    const response = { gameId };
    if (away) response.away = away;
    if (home) response.home = home;
    return NextResponse.json(response);
  } catch (err) {
    console.error(`[/api/games/${gameId}/pregame] error:`, err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
