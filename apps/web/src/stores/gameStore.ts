import { create } from "zustand";
import type { GameState } from "@card-game/shared-types";

export type UiPhase = "idle" | "connecting" | "lobby" | "playing" | "ended";

type GameStore = {
  uiPhase: UiPhase;
  roomId: string | null;
  playerId: string | null;
  playerName: string | null;
  gameState: GameState | null;
  errorMessage: string | null;

  setIdentity: (roomId: string, playerId: string, playerName: string) => void;
  setUiPhase: (phase: UiPhase) => void;
  updateGameState: (state: GameState) => void;
  setError: (message: string | null) => void;
  reset: () => void;
};

export const useGameStore = create<GameStore>((set) => ({
  uiPhase: "idle",
  roomId: null,
  playerId: null,
  playerName: null,
  gameState: null,
  errorMessage: null,

  setIdentity: (roomId, playerId, playerName) => set({ roomId, playerId, playerName, uiPhase: "connecting" }),
  setUiPhase: (uiPhase) => set({ uiPhase }),
  updateGameState: (gameState) => set({ gameState, uiPhase: gameState.phase, errorMessage: null }),
  setError: (errorMessage) => set({ errorMessage }),
  reset: () => set({ uiPhase: "idle", roomId: null, playerId: null, playerName: null, gameState: null, errorMessage: null }),
}));
