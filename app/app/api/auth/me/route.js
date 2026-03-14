import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken, getAuthCookie } from '../../../../lib/auth';
import { findUserById } from '../../../../lib/users';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = getAuthCookie(cookieStore);

    if (!token) {
      return NextResponse.json({ user: null });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ user: null });
    }

    const user = await findUserById(payload.userId);
    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        alertBluffing: user.alertBluffing,
        alertComeback: user.alertComeback,
        alertSwingWarning: user.alertSwingWarning,
      },
    });
  } catch (err) {
    console.error('Me error:', err);
    return NextResponse.json({ user: null });
  }
}
