// app/app/api/sim/route.js
import { NextResponse } from 'next/server';

export async function GET(request) {
  return NextResponse.redirect(new URL('/sim/20260320.json', request.url));
}
