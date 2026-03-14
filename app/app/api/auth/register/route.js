import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readUsers, writeUsers, findUserByPhone } from '../../../../lib/users';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { phone } = await request.json();

    if (!phone || typeof phone !== 'string' || phone.trim().length < 7) {
      return NextResponse.json({ error: 'Valid phone number is required' }, { status: 400 });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    // Check if user already exists
    const existing = findUserByPhone(cleanPhone);
    if (existing) {
      return NextResponse.json({ userId: existing.id, existing: true });
    }

    const user = {
      id: randomUUID(),
      phone: cleanPhone,
      firstName: null,
      lastName: null,
      email: null,
      activated: false,
      createdAt: new Date().toISOString(),
    };

    const users = readUsers();
    users.push(user);
    writeUsers(users);

    return NextResponse.json({ userId: user.id });
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
