import type { GameState, PlayerId } from "@card-game/shared-types";
import { updatePlayer } from "./state.js";
import type { EngineResult, SideEffect } from "./types.js";

/**
 * Fait passer le tour : avance `currentPlayerId` dans le sens `state.turnDirection`,
 * décrémente `skipTurns` des joueurs sautés. "Gilet jaune" (marqueur passif
 * `REVERSE_DIRECTION_AND_SKIP_IF_PRESENT`) est vérifié ICI (pas dans TURN_ENDED,
 * contrairement à Dragon/Finito) : si la rotation arrive sur un joueur qui la
 * porte encore, elle est défaussée, son tour est sauté, et le sens de rotation
 * s'inverse à partir de là — la recherche continue alors dans le nouveau sens.
 */
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
  let direction = state.turnDirection;
  let index = startIndex;
  let nextPlayerId: PlayerId | null = null;
  const sideEffects: SideEffect[] = [];
  // Borne large (pas juste order.length) : plusieurs Gilets jaunes peuvent se
  // succéder et inverser le sens plusieurs fois au sein d'un même appel.
  const maxSteps = order.length * 2;

  for (let steps = 0; steps < maxSteps; steps++) {
    index = (index + direction + order.length) % order.length;
    const candidate = order[index];
    if (!candidate || candidate.isEliminated) continue;
    // Ne jamais se resélectionner soi-même (peut arriver après un flip de sens
    // via Gilet jaune) — seulement de vrais AUTRES joueurs encore en jeu.
    if (candidate.id === state.currentPlayerId) continue;

    const live = next.players.find((p) => p.id === candidate.id)!;
    if (live.skipTurns > 0) {
      next = updatePlayer(next, candidate.id, (p) => ({ ...p, skipTurns: p.skipTurns - 1 }));
      continue;
    }

    const giletJaune = live.playedCards.find((c) =>
      c.effects.some((e) => e.type === "REVERSE_DIRECTION_AND_SKIP_IF_PRESENT"),
    );
    if (giletJaune) {
      next = updatePlayer(next, candidate.id, (p) => ({
        ...p,
        playedCards: p.playedCards.filter((c) => c.id !== giletJaune.id),
      }));
      next = { ...next, discardPile: [...next.discardPile, giletJaune] };
      direction = direction === 1 ? -1 : 1;
      sideEffects.push(
        { type: "CARD_DISCARDED_AFTER_PLAY", playerId: candidate.id, cardId: giletJaune.id },
        { type: "TURN_DIRECTION_REVERSED" },
      );
      continue;
    }

    nextPlayerId = candidate.id;
    break;
  }

  // Nouveau tour : le vol optionnel de Pingouins (STEAL_ON_TURN_START) redevient disponible.
  return {
    state: { ...next, currentPlayerId: nextPlayerId, turnDirection: direction, stolenThisTurn: false },
    sideEffects,
  };
}
