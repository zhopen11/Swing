import { useQuery } from '@tanstack/react-query';
import { getLiveGames } from '@/lib/api/games';
import type { LiveGamesResponse } from '@/lib/api/types';

const LIVE_POLL_INTERVAL_MS = 10_000;

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function useLiveGames(date?: string, isToday?: boolean) {
  const resolvedDate = date ?? todayET();
  const resolvedIsToday = isToday ?? true;
  return useQuery<LiveGamesResponse>({
    queryKey: ['live-games', resolvedDate],
    queryFn: () => getLiveGames(resolvedDate),
    refetchInterval: resolvedIsToday ? LIVE_POLL_INTERVAL_MS : false,
    staleTime: resolvedIsToday ? 5_000 : Infinity,
  });
}
