// app/app/api/sim/route.js
import { NextResponse } from 'next/server';
import simData from '../../../data/sim/20260320.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(simData);
}
