import { create } from 'zustand';
import type { SimReplay, SimAlertEvent, SimFrame, GameDetail, Alert } from '@/lib/api/types';

type SimStore = {
  isActive: boolean;
  isLoading: boolean;
  frames: SimFrame[];
  alertEvents: SimAlertEvent[];
  frameIndex: number;
  currentGames: GameDetail[];
  firedAlerts: Alert[];
  activate: (replay: SimReplay) => void;
  deactivate: () => void;
  setFrameIndex: (index: number) => void;
};

function deriveGames(frames: SimFrame[], index: number): GameDetail[] {
  return frames[index]?.games ?? [];
}

function deriveAlerts(frames: SimFrame[], events: SimAlertEvent[], index: number): Alert[] {
  const currentFrame = frames[index];
  if (!currentFrame) return [];
  const finalIds = new Set(
    currentFrame.games.filter((g) => g.state === 'final').map((g) => g.id),
  );
  return events
    .filter((e) => e.frameIndex <= index)
    .map((e): Alert => ({
      id: e.id,
      gameId: e.gameId,
      type: e.type,
      firedAt: e.firedAt,
      gameClock: e.gameClock,
      period: e.period,
      momentumPct: e.momentumPct,
      pointGap: e.pointGap,
      result: finalIds.has(e.gameId) ? 'HIT' : undefined,
      insight: undefined,
      swingers: undefined,
    }));
}

export const useSimStore = create<SimStore>((set) => ({
  isActive: false,
  isLoading: false,
  frames: [],
  alertEvents: [],
  frameIndex: 0,
  currentGames: [],
  firedAlerts: [],
  activate: (replay) =>
    set({
      isActive: true,
      isLoading: false,
      frames: replay.frames,
      alertEvents: replay.alertEvents,
      frameIndex: 0,
      currentGames: deriveGames(replay.frames, 0),
      firedAlerts: deriveAlerts(replay.frames, replay.alertEvents, 0),
    }),
  deactivate: () =>
    set({
      isActive: false,
      frames: [],
      alertEvents: [],
      frameIndex: 0,
      isLoading: false,
      currentGames: [],
      firedAlerts: [],
    }),
  setFrameIndex: (index) =>
    set((s) => ({
      frameIndex: index,
      currentGames: deriveGames(s.frames, index),
      firedAlerts: deriveAlerts(s.frames, s.alertEvents, index),
    })),
}));

// Selectors — read stable stored values, no inline computation
export function useSimGames(): GameDetail[] {
  return useSimStore((s) => s.currentGames);
}

export function useSimAlerts(): Alert[] {
  return useSimStore((s) => s.firedAlerts);
}
