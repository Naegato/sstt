import type { Card, CardPlayedEvent, GameState, PlayerId } from "@card-game/shared-types";
import { GameLogicError } from "./errors.js";
import { drawCards, eliminatePlayer, findPlayer, updatePlayer } from "./state.js";
import type { EngineResult, SideEffect } from "./types.js";

function removeFromHand(state: GameState, playerId: PlayerId, cardId: string): GameState {
  return updatePlayer(state, playerId, (p) => ({
    ...p,
    hand: p.hand.filter((c) => c.id !== cardId),
  }));
}

/** Place une carte face visible dans la pile personnelle d'un joueur (visible jusqu'à la fin de la partie). */
function placeInFrontOf(state: GameState, playerId: PlayerId, card: Card): GameState {
  return updatePlayer(state, playerId, (p) => ({
    ...p,
    playedCards: [...p.playedCards, card],
  }));
}

export function playCard(state: GameState, event: CardPlayedEvent): EngineResult {
  const player = findPlayer(state, event.playerId);
  const card = player.hand.find((c) => c.id === event.cardId);
  if (!card) {
    throw new GameLogicError("Cette carte n'est pas dans la main du joueur", "CARD_NOT_IN_HAND", {
      playerId: event.playerId,
      cardId: event.cardId,
    });
  }

  let next = removeFromHand(state, player.id, card.id);
  const sideEffects: SideEffect[] = [];
  const effect = card.effect;

  // Placement par défaut : devant soi, sauf si l'effet dit explicitement "devant un autre joueur".
  const placementTargetId = effect?.type === "PLACE_IN_FRONT_OF_TARGET" ? event.targetPlayerId : player.id;
  if (effect?.type === "PLACE_IN_FRONT_OF_TARGET" && !event.targetPlayerId) {
    throw new GameLogicError("Cet effet nécessite un joueur cible", "MISSING_TARGET", { cardId: card.id });
  }
  next = placeInFrontOf(next, placementTargetId as PlayerId, card);
  sideEffects.push({ type: "CARD_MOVED_TO_PLAYED", playerId: placementTargetId as PlayerId, cardId: card.id });

  if (effect) {
    switch (effect.type) {
      case "DRAW_CARDS": {
        const result = drawCards(next, player.id, effect.count);
        next = result.state;
        sideEffects.push(...result.sideEffects);
        break;
      }
      case "PLAY_AGAIN":
        sideEffects.push({ type: "PLAY_AGAIN_GRANTED", playerId: player.id });
        break;
      case "SKIP_NEXT_TURN": {
        const targetId = event.targetPlayerId ?? player.id;
        next = updatePlayer(next, targetId, (p) => ({ ...p, skipNextTurn: true }));
        sideEffects.push({ type: "TURN_SKIP_SCHEDULED", playerId: targetId });
        break;
      }
      case "ELIMINATE_SELF": {
        const result = eliminatePlayer(next, player.id);
        next = result.state;
        sideEffects.push(...result.sideEffects);
        break;
      }
      case "ELIMINATE_TARGET": {
        if (!event.targetPlayerId) {
          throw new GameLogicError("Cet effet nécessite un joueur cible", "MISSING_TARGET", { cardId: card.id });
        }
        const result = eliminatePlayer(next, event.targetPlayerId);
        next = result.state;
        sideEffects.push(...result.sideEffects);
        break;
      }
      case "PLACE_IN_FRONT_OF_SELF":
      case "PLACE_IN_FRONT_OF_TARGET":
        // déjà géré par le placement par défaut ci-dessus
        break;
      default: {
        const exhaustiveCheck: never = effect;
        throw new GameLogicError("Effet automatisé inconnu", "UNKNOWN_EFFECT", { effect: exhaustiveCheck });
      }
    }
  }

  return { state: next, sideEffects };
}
