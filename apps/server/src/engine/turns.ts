import type { GameState, PlayerId } from "@card-game/shared-types";
import { updatePlayer } from "./state.js";
import type { EngineResult } from "./types.js";

/** Fait passer le tour : avance `currentPlayerId`, consomme les flags `skipNextTurn` traversés. */
export function advanceTurn(state: GameState): EngineResult {
  if (state.currentPlayerId === null) {
    return { state, sideEffects: [] };
  }

  const order = state.players;
  const startIndex = order.findIndex((p) => p.id === state.currentPlayerId);
  if (startIndex === -1) {
    return { state: { ...state, currentPlayerId: null }, sideEffects: [] };
  }

  let next = state;
  let nextPlayerId: PlayerId | null = null;

  for (let offset = 1; offset <= order.length; offset++) {
    const candidate = order[(startIndex + offset) % order.length];
    if (!candidate || candidate.isEliminated) continue;
    if (candidate.skipNextTurn) {
      next = updatePlayer(next, candidate.id, (p) => ({ ...p, skipNextTurn: false }));
      continue;
    }
    nextPlayerId = candidate.id;
    break;
  }

  return { state: { ...next, currentPlayerId: nextPlayerId }, sideEffects: [] };
}
