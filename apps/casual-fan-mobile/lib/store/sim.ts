import { create } from 'zustand';
import type { SimReplay, SimAlertEvent, SimFrame, GameDetail, Alert } from '@/lib/api/types';

type SimStore = {
  isActive: boolean;
  isLoading: boolean;
  frames: SimFrame[];
  alertEvents: SimAlertEvent[];
  frameIndex: number;
  activate: (replay: SimReplay) => void;
  deactivate: () => void;
  setFrameIndex: (index: number) => void;
};

export const useSimStore = create<SimStore>((set) => ({
  isActive: false,
  isLoading: false,
  frames: [],
  alertEvents: [],
  frameIndex: 0,
  activate: (replay) =>
    set({
      isActive: true,
      isLoading: false,
      frames: replay.frames,
      alertEvents: replay.alertEvents,
      frameIndex: 0,
    }),
  deactivate: () =>
    set({ isActive: false, frames: [], alertEvents: [], frameIndex: 0, isLoading: false }),
  setFrameIndex: (index) => set({ frameIndex: index }),
}));

// Selector: games at current frame
export function useSimGames(): GameDetail[] {
  return useSimStore((s) =>
    s.isActive && s.frames.length > 0 ? s.frames[s.frameIndex]?.games ?? [] : [],
  );
}

// Selector: alerts that have fired up to current frame, with result derived from game state
export function useSimAlerts(): Alert[] {
  return useSimStore((s) => {
    if (!s.isActive || s.frames.length === 0) return [];
    const currentFrame = s.frames[s.frameIndex];
    if (!currentFrame) return [];

    const finalGameIds = new Set(
      currentFrame.games.filter((g) => g.state === 'final').map((g) => g.id),
    );

    return s.alertEvents
      .filter((e) => e.frameIndex <= s.frameIndex)
      .map((e): Alert => ({
        id: e.id,
        gameId: e.gameId,
        type: e.type,
        firedAt: e.firedAt,
        gameClock: e.gameClock,
        period: e.period,
        momentumPct: e.momentumPct,
        pointGap: e.pointGap,
        result: finalGameIds.has(e.gameId) ? 'HIT' : undefined,
        insight: undefined,
        swingers: undefined,
      }));
  });
}
