import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearAuthCookie } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const cookieStore = await cookies();
    clearAuthCookie(cookieStore);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Signout error:', err);
    return NextResponse.json({ error: 'Sign out failed' }, { status: 500 });
  }
}
