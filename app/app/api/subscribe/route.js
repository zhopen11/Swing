import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken, getAuthCookie } from '../../../lib/auth';
import { findSubscription, addSubscription, removeSubscription } from '../../../lib/subscriptions';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const token = getAuthCookie(cookieStore);

    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { gameId } = body;

    if (!gameId) {
      return NextResponse.json({ error: 'gameId is required' }, { status: 400 });
    }

    const existing = findSubscription(payload.userId, gameId);

    if (existing) {
      removeSubscription(payload.userId, gameId);
      return NextResponse.json({ subscribed: false });
    } else {
      addSubscription(payload.userId, gameId);
      return NextResponse.json({ subscribed: true });
    }
  } catch (err) {
    console.error('Subscribe error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
