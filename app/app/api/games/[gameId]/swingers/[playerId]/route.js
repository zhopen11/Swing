import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://the-swing.vercel.app';

function clamp(v) { return Math.max(0, Math.min(100, v)); }

function buildDetail(entry, abbr, league) {
  const appearances = Math.max(entry.swingAppearances ?? 0, 1);
  const positive = entry.positivePlays ?? 0;
  const negative = entry.negativePlays ?? 0;
  const clutch = entry.clutchAppearances ?? 0;
  return {
    playerId: entry.athleteId ?? '',
    name: entry.player ?? '',
    position: '',
    jerseyNumber: entry.jersey ?? undefined,
    team: { abbr, name: abbr, fullName: abbr, league },
    swingScore: Math.round(entry.totalImpact ?? 0),
    lastPossessions: { scoredOn: positive, turnovers: negative },
    contribution: {
      scoring: clamp(Math.round((positive / appearances) * 100)),
      playmaking: clamp(Math.round((clutch / appearances) * 100)),
      defense: clamp(Math.round(((appearances - negative) / appearances) * 100)),
    },
  };
}

export async function GET(request, { params }) {
  const { gameId, playerId } = await params;
  try {
    const pollRes = await fetch(`${BASE_URL}/api/poll`, { next: { revalidate: 0 } });
    if (!pollRes.ok) return NextResponse.json({ error: 'upstream error' }, { status: 404 });
    const { games: rawGames = [] } = await pollRes.json();
    const game = rawGames.find((g) => g.id === gameId);
    if (!game) return NextResponse.json({ error: 'game not found' }, { status: 404 });

    const awayEntry = (game.swingers?.away ?? []).find((s) => s.athleteId === playerId);
    if (awayEntry) return NextResponse.json(buildDetail(awayEntry, game.awayAbbr, game.league));

    const homeEntry = (game.swingers?.home ?? []).find((s) => s.athleteId === playerId);
    if (homeEntry) return NextResponse.json(buildDetail(homeEntry, game.homeAbbr, game.league));

    return NextResponse.json({ error: 'player not found' }, { status: 404 });
  } catch (err) {
    console.error(`[/api/games/${gameId}/swingers/${playerId}] error:`, err);
    return NextResponse.json({ error: 'internal error' }, { status: 404 });
  }
}
