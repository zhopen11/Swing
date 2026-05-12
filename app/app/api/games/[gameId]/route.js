import { NextResponse } from 'next/server';
import { toGameDetail } from '../../../../lib/poll-transform';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://the-swing.vercel.app';

export async function GET(request, { params }) {
  const { gameId } = await params;
  try {
    const pollRes = await fetch(`${BASE_URL}/api/poll`, { next: { revalidate: 0 } });
    if (!pollRes.ok) {
      return NextResponse.json({ error: 'upstream error' }, { status: pollRes.status });
    }
    const { games: rawGames = [] } = await pollRes.json();
    const raw = rawGames.find((g) => g.id === gameId);
    if (!raw) return NextResponse.json({ error: 'game not found' }, { status: 404 });
    return NextResponse.json(toGameDetail(raw));
  } catch (err) {
    console.error(`[/api/games/${gameId}] error:`, err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
