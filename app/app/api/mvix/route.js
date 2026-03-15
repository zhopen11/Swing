/** /api/mvix?team=DEN&league=NBA — Get team MVIX history and rolling values. */
/** /api/mvix?league=NBA — Get all team rolling MVIX values for a league. */

import { NextResponse } from 'next/server';
import { getTeamHistory, getTeamRolling, getAllTeamRollings, recordGameMvix } from '../../../lib/team-mvix';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const team = url.searchParams.get('team');
    const league = url.searchParams.get('league') || 'NBA';

    // Single team: return history + rolling
    if (team) {
      const [history, rolling] = await Promise.all([
        getTeamHistory(team, league),
        getTeamRolling(team, league),
      ]);

      return NextResponse.json({
        team,
        league,
        rolling,
        history,
      });
    }

    // All teams in a league: return rolling values
    const teams = await getAllTeamRollings(league);
    return NextResponse.json({
      league,
      teams: teams.sort((a, b) => a.rollingAvgUpMagnitude - b.rollingAvgUpMagnitude),
    });
  } catch (err) {
    console.error('MVIX API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { team, league, gameId, gameDate, won, score, vol } = await request.json();
    if (!team || !league || !gameId || !gameDate || !vol) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const result = await recordGameMvix(team, league, gameId, gameDate, won, score, vol);
    return NextResponse.json(result);
  } catch (err) {
    console.error('MVIX POST error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
