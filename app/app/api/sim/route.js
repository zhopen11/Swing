// app/app/api/sim/route.js
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

let cached = null;

export async function GET() {
  try {
    if (!cached) {
      const filePath = join(process.cwd(), 'data', 'sim', '20260320.json');
      cached = JSON.parse(readFileSync(filePath, 'utf8'));
    }
    return NextResponse.json(cached);
  } catch (err) {
    console.error('[/api/sim] error:', err);
    return NextResponse.json({ error: 'Sim data not found' }, { status: 404 });
  }
}
