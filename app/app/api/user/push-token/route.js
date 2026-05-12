import { NextResponse } from 'next/server';
import { sql } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const { token } = body ?? {};
  if (!token || typeof token !== 'string' || !token.trim()) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `;
    await sql`
      INSERT INTO push_tokens (token) VALUES (${token.trim()})
      ON CONFLICT (token) DO UPDATE SET updated_at = now()
    `;
    return NextResponse.json({});
  } catch (err) {
    console.error('[/api/user/push-token] error:', err);
    return NextResponse.json({ error: 'database error' }, { status: 500 });
  }
}
