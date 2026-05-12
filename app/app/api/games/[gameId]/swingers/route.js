import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://the-swing.vercel.app';

export async function GET(request, { params }) {
  const { gameId } = await params;
  try {
    const pollRes = await fetch(`${BASE_URL}/api/poll`, { next: { revalidate: 0 } });
    if (!pollRes.ok) return NextResponse.json({ gameId, swingers: [] }, { status: pollRes.status });
    const { games: rawGames = [] } = await pollRes.json();
    const raw = rawGames.find((g) => g.id === gameId);
    if (!raw) return NextResponse.json({ gameId, swingers: [] }, { status: 404 });

    function mapTeam(entries, abbr, league) {
      return (entries ?? []).filter((s) => s.player).map((s, i) => ({
        playerId: s.athleteId ?? '',
        name: s.player,
        position: '',
        team: { abbr, name: abbr, fullName: abbr, league },
        swingScore: Math.round(s.totalImpact ?? 0),
        rank: i + 1,
      }));
    }

    const merged = [
      ...mapTeam(raw.swingers?.away, raw.awayAbbr, raw.league),
      ...mapTeam(raw.swingers?.home, raw.homeAbbr, raw.league),
    ].sort((a, b) => b.swingScore - a.swingScore).map((s, i) => ({ ...s, rank: i + 1 }));

    return NextResponse.json({ gameId, swingers: merged });
  } catch (err) {
    console.error(`[/api/games/${gameId}/swingers] error:`, err);
    return NextResponse.json({ gameId, swingers: [] }, { status: 500 });
  }
}
