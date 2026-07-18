import type { GameEvent, GameState } from "@card-game/shared-types";
import { GameLogicError } from "./errors.js";
import { playCard } from "./cards.js";
import {
  addPlayer,
  castVote,
  checkEndOfTurnDanger,
  checkFinito,
  clearEliminationBatch,
  clearOpenReflexWindow,
  createInitialState,
  drawCards,
  eliminatePlayer,
  isDrawPileLocked,
  passHotPotato,
  resetGameToLobby,
  startDenunciationVote,
  startGame,
  stealPlayedCard,
  submitChoice,
} from "./state.js";
import { advanceTurn } from "./turns.js";
import type { EngineResult, SideEffect } from "./types.js";

export type { EngineResult, SideEffect } from "./types.js";
export { createInitialState } from "./state.js";
export { GameLogicError } from "./errors.js";

/**
 * Fonction pure : même état + même event → toujours le même résultat.
 * Aucun I/O, aucun aléatoire ici (voir GameStartedEvent.deck pour le déterminisme du mélange).
 */
export function processEvent(state: GameState, event: GameEvent): EngineResult {
  if (state.phase === "ended" && !canReactAfterGameEnded(state, event)) {
    return { state, sideEffects: [] };
  }

  const result = dispatch(state, event);
  return applyDemonicLaughterTriggers(result);
}

/**
 * Exceptions au court-circuit "partie terminée" : "Enfoiré !"
 * (REACT_TO_OTHER_PLAYER_VICTORY), jouable juste après qu'un joueur ait gagné,
 * et GAME_RESET ("Rejouer une partie"), qui n'a de sens QUE quand la partie
 * est terminée. L'éligibilité complète d'Enfoiré ! (un seul vainqueur, pas
 * soi-même, pas éliminé) est vérifiée dans playCard() — ici on vérifie juste
 * que la carte a cet effet, pour décider si l'event a le droit de continuer
 * jusqu'à dispatch().
 */
function canReactAfterGameEnded(state: GameState, event: GameEvent): boolean {
  if (event.type === "GAME_RESET") return true;
  if (event.type !== "CARD_PLAYED") return false;
  const player = state.players.find((p) => p.id === event.playerId);
  const card = player?.hand.find((c) => c.id === event.cardId);
  return card?.effects.some((e) => e.type === "REACT_TO_OTHER_PLAYER_VICTORY") ?? false;
}

function dispatch(state: GameState, event: GameEvent): EngineResult {
  switch (event.type) {
    case "PLAYER_JOINED":
      return { state: addPlayer(state, event.playerId, event.playerName), sideEffects: [] };
    case "GAME_STARTED":
      return { state: startGame(state, event.deck), sideEffects: [] };
    case "CARD_DRAWN":
      return drawAtTurnStart(state, event.playerId);
    case "CARD_PLAYED":
      return playCard(state, event);
    case "TURN_ENDED": {
      if (state.pendingVote) {
        throw new GameLogicError(
          "Un vote est en cours, impossible de terminer le tour avant sa résolution",
          "VOTE_PENDING",
          { voteMode: state.pendingVote.mode },
        );
      }
      if (state.pendingChoice) {
        throw new GameLogicError(
          "Un choix simultané est en cours, impossible de terminer le tour avant sa résolution",
          "CHOICE_PENDING",
          { choiceMode: state.pendingChoice.mode },
        );
      }
      // La fenêtre de réaction "Gros nul !" et celle de dénonciation d'une carte
      // réflexe instantanée se referment toutes les deux à la fin du tour courant.
      const stateWithoutBatch = clearOpenReflexWindow(clearEliminationBatch(state));
      // Vérifie d'abord si le joueur dont le tour se termine porte une carte
      // "danger" (Dragon, Laser...) avant de calculer le joueur suivant.
      const dangerCheck = checkEndOfTurnDanger(stateWithoutBatch, event.playerId);
      if (dangerCheck.state.phase === "ended") {
        return dangerCheck;
      }
      // "Finito" : armé au premier passage, déclenché au second (voir checkFinito).
      const finitoCheck = checkFinito(dangerCheck.state, event.playerId);
      if (finitoCheck.state.phase === "ended") {
        return { state: finitoCheck.state, sideEffects: [...dangerCheck.sideEffects, ...finitoCheck.sideEffects] };
      }
      const turnResult = advanceTurn(finitoCheck.state);
      return {
        state: turnResult.state,
        sideEffects: [...dangerCheck.sideEffects, ...finitoCheck.sideEffects, ...turnResult.sideEffects],
      };
    }
    case "PLAYER_ELIMINATED":
      return eliminatePlayer(state, event.playerId);
    case "VOTE_CAST":
      return castVote(state, event.playerId, event.choice);
    case "STEAL_PLAYED_CARD":
      return stealPlayedCard(state, event.playerId, event.targetPlayerId, event.cardId);
    case "PASS_HOT_POTATO":
      return passHotPotato(state, event.playerId);
    case "MANUAL_ACTION_CONFIRMED":
      // Pas de transition d'état automatique : c'est un événement déclaratif, tracé
      // pour l'historique/replay.
      return { state, sideEffects: [] };
    case "ELIMINATION_CHALLENGED": {
      // Dénonciation : ouvre un vote à majorité (voir startDenunciationVote/castVote
      // dans state.ts) — pas liée à une carte, pas à l'ordre des tours.
      const next = startDenunciationVote(state, event.challengerId, event.targetPlayerId, event.reason);
      return {
        state: next,
        sideEffects: [{ type: "DENUNCIATION_STARTED", accuserId: event.challengerId, accusedId: event.targetPlayerId }],
      };
    }
    case "GAME_ENDED":
      return { state: { ...state, phase: "ended", winnerIds: event.winnerIds }, sideEffects: [] };
    case "GAME_RESET": {
      // Contrairement aux autres events, GAME_RESET n'a de sens QUE si la
      // partie est réellement terminée côté serveur (le bouton "Rejouer" côté
      // UI ne fait que suivre cet état, il ne le décide pas) — sinon un client
      // pourrait réinitialiser une partie en cours.
      if (state.phase !== "ended") {
        throw new GameLogicError("Impossible de rejouer une partie qui n'est pas terminée", "GAME_NOT_ENDED", {
          phase: state.phase,
        });
      }
      return { state: resetGameToLobby(state), sideEffects: [{ type: "GAME_RESET" }] };
    }
    case "CHOICE_SUBMITTED":
      return submitChoice(state, event.playerId, event.value);
    default: {
      const exhaustiveCheck: never = event;
      throw new Error(`Event inconnu: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}

/**
 * Pioche de début de tour (event CARD_DRAWN, toujours émis par le service pour
 * le joueur actuellement courant — voir GameService.drawForCurrentPlayer). Si
 * "Pioche verrouillée !" est en jeu (LOCK_DRAW_PILE), la pioche ne ramène jamais
 * rien : un joueur qui se retrouve alors avec une main vide n'a rien à jouer à
 * son tour et est immédiatement éliminé (règle officielle). On avance ensuite
 * au joueur suivant et on retente pour lui — boucle bornée : chaque itération
 * qui ne s'arrête pas élimine un joueur de plus, et la partie se termine dès
 * qu'il n'en reste plus qu'un (voir eliminatePlayer).
 */
function drawAtTurnStart(state: GameState, playerId: string): EngineResult {
  const sideEffects: SideEffect[] = [];
  let next = state;
  let currentTargetId: string | null = playerId;

  while (currentTargetId) {
    const drawResult = drawCards(next, currentTargetId, 1);
    next = drawResult.state;
    sideEffects.push(...drawResult.sideEffects);

    const player = next.players.find((p) => p.id === currentTargetId);
    if (!player || player.hand.length > 0 || !isDrawPileLocked(next)) {
      break;
    }

    const elimResult = eliminatePlayer(next, currentTargetId);
    next = elimResult.state;
    sideEffects.push(...elimResult.sideEffects);
    if (next.phase === "ended") break;

    const turnResult = advanceTurn(next);
    next = turnResult.state;
    sideEffects.push(...turnResult.sideEffects);
    currentTargetId = next.currentPlayerId;
  }

  return { state: next, sideEffects };
}

/**
 * Marqueur passif "Rire démoniaque" (DRAW_ON_ANY_ELIMINATION) : vérifié de façon
 * centrale après CHAQUE event (pas seulement CARD_PLAYED) pour couvrir aussi les
 * éliminations différées (danger de fin de tour) et celles issues d'un vote.
 * Chaque joueur qui a cette carte posée devant lui pioche 1 carte par élimination
 * survenue pendant cet event (peu importe qui a été éliminé ou par quoi).
 */
function applyDemonicLaughterTriggers(result: EngineResult): EngineResult {
  const eliminationCount = result.sideEffects.filter((e) => e.type === "PLAYER_ELIMINATED").length;
  if (eliminationCount === 0) {
    return result;
  }

  let next = result.state;
  const extraSideEffects: SideEffect[] = [];
  for (const player of result.state.players) {
    const hasDemonicLaughter = player.playedCards.some((c) =>
      c.effects.some((e) => e.type === "DRAW_ON_ANY_ELIMINATION"),
    );
    if (!hasDemonicLaughter) continue;

    const drawResult = drawCards(next, player.id, eliminationCount);
    next = drawResult.state;
    extraSideEffects.push(...drawResult.sideEffects);
  }

  return { state: next, sideEffects: [...result.sideEffects, ...extraSideEffects] };
}

/** Reconstruit l'état en rejouant une séquence d'events depuis un état initial. */
export function replayEvents(events: GameEvent[], initialState: GameState): GameState {
  return events.reduce((state, event) => processEvent(state, event).state, initialState);
}
