import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { findUserById, updateUser } from '../../../../lib/users';
import { createToken, setAuthCookie } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { userId, firstName, lastName, email } = await request.json();

    if (!userId || !firstName || !lastName || !email) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const existing = await findUserById(userId);
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = await updateUser(userId, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      activated: true,
    });

    const token = createToken(user);
    const cookieStore = await cookies();
    setAuthCookie(cookieStore, token);

    return NextResponse.json({ success: true, user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone } });
  } catch (err) {
    console.error('Complete error:', err);
    return NextResponse.json({ error: 'Completion failed' }, { status: 500 });
  }
}
