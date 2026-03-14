import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken, getAuthCookie } from '../../../lib/auth';
import { findSubscriptionsByUser } from '../../../lib/subscriptions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = getAuthCookie(cookieStore);

    if (!token) {
      return NextResponse.json({ gameIds: [] });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ gameIds: [] });
    }

    const subs = findSubscriptionsByUser(payload.userId);
    const gameIds = subs.map((s) => s.gameId);

    return NextResponse.json({ gameIds });
  } catch (err) {
    console.error('Subscriptions error:', err);
    return NextResponse.json({ gameIds: [] });
  }
}
