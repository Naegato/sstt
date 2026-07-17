import type { GameEvent, GameState } from "@card-game/shared-types";
import { playCard } from "./cards.js";
import { addPlayer, createInitialState, drawCards, eliminatePlayer, startGame } from "./state.js";
import { advanceTurn } from "./turns.js";
import type { EngineResult } from "./types.js";

export type { EngineResult, SideEffect } from "./types.js";
export { createInitialState } from "./state.js";
export { GameLogicError } from "./errors.js";

/**
 * Fonction pure : même état + même event → toujours le même résultat.
 * Aucun I/O, aucun aléatoire ici (voir GameStartedEvent.deck pour le déterminisme du mélange).
 */
export function processEvent(state: GameState, event: GameEvent): EngineResult {
  if (state.phase === "ended") {
    return { state, sideEffects: [] };
  }

  switch (event.type) {
    case "PLAYER_JOINED":
      return { state: addPlayer(state, event.playerId, event.playerName), sideEffects: [] };
    case "GAME_STARTED":
      return { state: startGame(state, event.deck), sideEffects: [] };
    case "CARD_DRAWN":
      return drawCards(state, event.playerId, 1);
    case "CARD_PLAYED":
      return playCard(state, event);
    case "TURN_ENDED":
      return advanceTurn(state);
    case "PLAYER_ELIMINATED":
      return eliminatePlayer(state, event.playerId);
    case "MANUAL_ACTION_CONFIRMED":
    case "ELIMINATION_CHALLENGED":
      // Pas de transition d'état automatique : c'est un événement déclaratif, tracé
      // pour l'historique/replay. Une élimination éventuelle passe par son propre event.
      return { state, sideEffects: [] };
    case "GAME_ENDED":
      return { state: { ...state, phase: "ended", winnerId: event.winnerId }, sideEffects: [] };
    default: {
      const exhaustiveCheck: never = event;
      throw new Error(`Event inconnu: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

/** Reconstruit l'état en rejouant une séquence d'events depuis un état initial. */
export function replayEvents(events: GameEvent[], initialState: GameState): GameState {
  return events.reduce((state, event) => processEvent(state, event).state, initialState);
}
