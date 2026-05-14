import type { SimReplay } from './types';

export async function getSimReplay(): Promise<SimReplay> {
  const res = await fetch('https://the-swing.vercel.app/sim/20260320.json', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<SimReplay>;
}
