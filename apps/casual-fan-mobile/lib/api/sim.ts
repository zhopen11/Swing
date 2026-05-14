import { apiFetch } from './client';
import type { SimReplay } from './types';

export function getSimReplay(): Promise<SimReplay> {
  return apiFetch<SimReplay>('/api/sim');
}
