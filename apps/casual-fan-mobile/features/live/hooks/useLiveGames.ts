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
  // Poll route expects YYYYMMDD with no dashes; omit date entirely for today
  // so the live poll uses its normal today+yesterday logic
  const apiDate = resolvedIsToday ? undefined : resolvedDate.replace(/-/g, '');
  return useQuery<LiveGamesResponse>({
    queryKey: ['live-games', resolvedDate],
    queryFn: () => getLiveGames(apiDate),
    refetchInterval: resolvedIsToday ? LIVE_POLL_INTERVAL_MS : false,
    staleTime: resolvedIsToday ? 5_000 : Infinity,
  });
}
