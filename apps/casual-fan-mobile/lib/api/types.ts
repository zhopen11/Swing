export type SportType = 'basketball' | string;

export type League = 'NBA' | 'CBB';

export type GameState = 'scheduled' | 'live' | 'final' | 'cancelled' | 'postponed';

export type AlertType = 'bluffing' | 'comeback' | 'swing-warning';

export type NotificationTier = 'ALL' | 'ALERTS' | 'PERIOD' | 'OFF';

export type FollowKind = 'team' | 'sport' | 'game';

type AlgorithmMetadata = {
  algoId?: string;
  algoVersion?: string;
  computedAt?: string;
};

export type TeamRef = {
  abbr: string;
  name: string;
  fullName: string;
  league: League;
};

export type TeamGameState = AlgorithmMetadata & {
  team: TeamRef;
  score?: number;
  momentum?: number;
  mvix?: number;
  mrvi?: number;
  spread?: number;
  isFavorite?: boolean;
};

export type GameDetail = AlgorithmMetadata & {
  id: string;
  league: League;
  state: GameState;
  startsAt: string;
  period?: string;
  clock?: string;
  home: TeamGameState;
  away: TeamGameState;
  spread?: number;
  total?: number;
  insight?: string;
};

export type LiveGamesResponse = {
  games: GameDetail[];
};

export type MomentumPoint = {
  gameTime: string;
  period: string;
  home: number;
  away: number;
};

export type MomentumTimeline = AlgorithmMetadata & {
  gameId: string;
  points: MomentumPoint[];
};

export type SwingerRef = {
  playerId: string;
  name: string;
  position: string;
  team: TeamRef;
  swingScore: number;
  rank: number;
};

export type SwingerList = AlgorithmMetadata & {
  gameId: string;
  swingers: SwingerRef[];
};

export type SwingerDetail = AlgorithmMetadata & {
  playerId: string;
  name: string;
  position: string;
  jerseyNumber?: string;
  team: TeamRef;
  swingScore: number;
  lastPossessions: {
    scoredOn?: number;
    assists?: number;
    stops?: number;
    turnovers?: number;
  };
  contribution: {
    scoring: number;
    playmaking: number;
    defense: number;
  };
  narrative?: string;
};

export type Alert = AlgorithmMetadata & {
  id: string;
  gameId: string;
  type: AlertType;
  firedAt: string;
  gameClock: string;
  period: string;
  momentumPct?: number;
  pointGap?: number;
  result?: 'HIT' | 'PUSH' | 'MISS';
  insight?: string;
  swingers?: SwingerRef[];
};

export type PregameTeamStats = {
  team: TeamRef;
  avgMomentum: number;
  avgMomentumDelta: number;
  mvix: number;
  mvixDelta: number;
  mvixTrend: 'TRENDING STEADY' | 'TRENDING CHAOTIC';
  mvixSparkline: number[];
  topSwingers: Array<{
    name: string;
    position: string;
    contribution: number;
    rank: number;
  }>;
  recentForm: Array<{
    result: 'W' | 'L';
    ats: 'W' | 'L' | 'P';
  }>;
};

export type PregameStats = AlgorithmMetadata & {
  gameId: string;
  home?: PregameTeamStats;
  away?: PregameTeamStats;
};

export type Follow = {
  id: string;
  kind: FollowKind;
  sportType?: SportType;
  teamAbbr?: string;
  gameId?: string;
  tier: NotificationTier;
  createdAt: string;
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  memberSince: string;
  inviteCount: number;
  inviteUsed: number;
};

export type UserSnapshot = {
  followedAlerts: number;
  hitRate: number;
  hitRateDelta: number;
  bestCall?: {
    value: number;
    description: string;
  };
};

export type SimAlertEvent = {
  id: string;
  frameIndex: number;
  simTime: string;
  gameId: string;
  type: AlertType;
  firedAt: string;
  gameClock: string;
  period: string;
  awayAbbr: string;
  homeAbbr: string;
  awayScore: number;
  homeScore: number;
  momentumPct: number;
  pointGap: number;
};

export type SimFrame = {
  frameIndex: number;
  simTime: string;
  label: string;
  games: GameDetail[];
};

export type SimReplay = {
  date: string;
  windowStart: string;
  windowEnd: string;
  frames: SimFrame[];
  alertEvents: SimAlertEvent[];
};
