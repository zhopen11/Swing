import { NextResponse } from 'next/server';
import { toMomentumTimeline } from '../../../../../lib/poll-transform';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://the-swing.vercel.app';

export async function GET(request, { params }) {
  const { gameId } = await params;
  try {
    const pollRes = await fetch(`${BASE_URL}/api/poll`, { next: { revalidate: 0 } });
    if (!pollRes.ok) {
      return NextResponse.json({ gameId, points: [] }, { status: pollRes.status });
    }
    const { games: rawGames = [] } = await pollRes.json();
    const raw = rawGames.find((g) => g.id === gameId);
    if (!raw) return NextResponse.json({ gameId, points: [] }, { status: 404 });
    return NextResponse.json(toMomentumTimeline(gameId, raw.mom));
  } catch (err) {
    console.error(`[/api/games/${gameId}/momentum] error:`, err);
    return NextResponse.json({ gameId, points: [] }, { status: 500 });
  }
}
