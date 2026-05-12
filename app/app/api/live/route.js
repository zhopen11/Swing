import { NextResponse } from 'next/server';
import { toGameDetail } from '../../../lib/poll-transform';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://the-swing.vercel.app';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const pollUrl = new URL('/api/poll', BASE_URL);
    if (date) pollUrl.searchParams.set('date', date);

    const pollRes = await fetch(pollUrl.toString(), { next: { revalidate: 0 } });
    if (!pollRes.ok) {
      return NextResponse.json(
        { games: [], timestamp: new Date().toISOString() },
        { status: pollRes.status },
      );
    }

    const { games: rawGames = [], timestamp } = await pollRes.json();
    const games = rawGames.map(toGameDetail);

    return NextResponse.json({ games, timestamp });
  } catch (err) {
    console.error('[/api/live] error:', err);
    return NextResponse.json({ games: [], timestamp: new Date().toISOString() }, { status: 500 });
  }
}
