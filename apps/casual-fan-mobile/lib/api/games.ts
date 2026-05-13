import { apiFetch } from './client';
import type {
  LiveGamesResponse,
  GameDetail,
  MomentumTimeline,
  SwingerList,
  SwingerDetail,
  Alert,
  PregameStats,
} from './types';

export function getLiveGames(date?: string): Promise<LiveGamesResponse> {
  return apiFetch<LiveGamesResponse>(date ? `/api/live?date=${date}` : '/api/live');
}

export function getGame(id: string): Promise<GameDetail> {
  return apiFetch<GameDetail>(`/api/games/${id}`);
}

export function getGameMomentum(id: string): Promise<MomentumTimeline> {
  return apiFetch<MomentumTimeline>(`/api/games/${id}/momentum`);
}

export function getGameSwingers(id: string): Promise<SwingerList> {
  return apiFetch<SwingerList>(`/api/games/${id}/swingers`);
}

export function getGameAlerts(id: string): Promise<Alert[]> {
  return apiFetch<Alert[]>(`/api/games/${id}/alerts`);
}

export function getSwinger(gameId: string, playerId: string): Promise<SwingerDetail> {
  return apiFetch<SwingerDetail>(`/api/games/${gameId}/swingers/${playerId}`);
}

export function getPregameStats(id: string): Promise<PregameStats> {
  return apiFetch<PregameStats>(`/api/games/${id}/pregame`);
}
