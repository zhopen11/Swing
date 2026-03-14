import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readUsers, writeUsers, findUserById } from '../../../../lib/users';
import { createToken, setAuthCookie } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { userId, firstName, lastName, email } = await request.json();

    if (!userId || !firstName || !lastName || !email) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const users = readUsers();
    const idx = users.findIndex((u) => u.id === userId);

    if (idx === -1) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    users[idx].firstName = firstName.trim();
    users[idx].lastName = lastName.trim();
    users[idx].email = email.trim();
    users[idx].activated = true;
    writeUsers(users);

    const token = createToken(users[idx]);
    const cookieStore = await cookies();
    setAuthCookie(cookieStore, token);

    return NextResponse.json({ success: true, user: { id: users[idx].id, firstName: users[idx].firstName } });
  } catch (err) {
    console.error('Complete error:', err);
    return NextResponse.json({ error: 'Completion failed' }, { status: 500 });
  }
}
