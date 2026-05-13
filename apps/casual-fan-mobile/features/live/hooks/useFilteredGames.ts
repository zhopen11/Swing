import { useMemo } from 'react';
import { useLiveFilterStore } from '@/lib/store/live-filter';
import { useFollowsStore } from '@/lib/store/follows';
import type { GameDetail } from '@/lib/api/types';

export function useFilteredGames(games: GameDetail[] | undefined) {
  const filter = useLiveFilterStore((s) => s.filter);
  const followedTeamAbbrs = useFollowsStore((s) => s.followedTeamAbbrs);

  return useMemo(() => {
    if (!games) return { live: [], upcoming: [], final: [] };

    const live = games.filter((g) => g.state === 'live');
    const upcoming = games.filter((g) => g.state === 'scheduled');
    const final = games.filter((g) => g.state === 'final');

    function applyFilter(list: GameDetail[]): GameDetail[] {
      switch (filter) {
        case 'nba':
          return list.filter((g) => g.league === 'NBA');
        case 'cbb':
          return list.filter((g) => g.league === 'CBB');
        case 'following':
          if (followedTeamAbbrs.size === 0) return [];
          return list.filter(
            (g) =>
              followedTeamAbbrs.has(g.home.team.abbr) ||
              followedTeamAbbrs.has(g.away.team.abbr),
          );
        default:
          return list;
      }
    }

    return { live: applyFilter(live), upcoming: applyFilter(upcoming), final: applyFilter(final) };
  }, [games, filter, followedTeamAbbrs]);
}
