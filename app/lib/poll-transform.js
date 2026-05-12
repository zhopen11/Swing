/**
 * Transforms raw /api/poll game objects into the mobile GameDetail shape.
 */

const STATUS_MAP = {
  STATUS_IN_PROGRESS: 'live',
  STATUS_HALFTIME:    'live',
  STATUS_FINAL:       'final',
  STATUS_SCHEDULED:   'scheduled',
  STATUS_CANCELLED:   'cancelled',
  STATUS_POSTPONED:   'postponed',
};

function toTeamRef(abbr, name, league) {
  return { abbr, name, fullName: name, league };
}

export function toGameDetail(g) {
  const spread = g.odds?.spread ?? undefined;
  const homeIsFavorite = spread != null ? spread < 0 : undefined;

  return {
    id: g.id,
    league: g.league,
    state: STATUS_MAP[g.status] ?? 'scheduled',
    startsAt: g.date,
    period: g.period != null ? String(g.period) : undefined,
    clock: g.clock,
    insight: g.insight,
    spread,
    total: g.odds?.overUnder ?? undefined,
    away: {
      team: toTeamRef(g.awayAbbr, g.awayName, g.league),
      score: g.awayScore,
      momentum: g.mom?.away != null ? Math.round(g.mom.away) : undefined,
      mvix: g.mvixAway?.mvix ?? undefined,
      mrvi: g.mvixAway?.mrvi ?? undefined,
      isFavorite: homeIsFavorite != null ? !homeIsFavorite : undefined,
    },
    home: {
      team: toTeamRef(g.homeAbbr, g.homeName, g.league),
      score: g.homeScore,
      momentum: g.mom?.home != null ? Math.round(g.mom.home) : undefined,
      mvix: g.mvixHome?.mvix ?? undefined,
      mrvi: g.mvixHome?.mrvi ?? undefined,
      isFavorite: homeIsFavorite,
    },
  };
}

export function toMomentumTimeline(gameId, mom) {
  if (!mom?.chartAway?.length || !mom?.chartHome?.length) {
    return { gameId, points: [] };
  }
  const points = mom.chartAway.map((ap, i) => {
    const hp = mom.chartHome[i] ?? {};
    return {
      gameTime: ap.t ?? '',
      period: ap.p != null ? String(ap.p) : '',
      away: Math.round(ap.v ?? 0),
      home: Math.round(hp.v ?? 0),
    };
  });
  return { gameId, points };
}
