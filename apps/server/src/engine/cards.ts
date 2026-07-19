import type { AutomatedEffect, Card, CardId, CardPlayedEvent, GameState, PlayerId } from "@card-game/shared-types";
import { GameLogicError } from "./errors.js";
import {
  addPoints,
  cancelLastPlayedCard,
  clearEliminationBatch,
  countCardOnBoard,
  declareWinners,
  drawCards,
  eliminateAllAlivePlayers,
  eliminatePlayer,
  findPlayer,
  hasEnoughBombsOnBoard,
  isProtectedByDinosaur,
  noPlayerHasStarCardInHand,
  reactToGroupElimination,
  reactToVictory,
  revealBombsAndWinIfEnough,
  reshuffleAllHandsAndRedraw,
  scheduleFinito,
  setPointsToWin,
  startCakeOrGraveVote,
  startDeathOrTchiVote,
  startFingerCountChallenge,
  startHandSlap,
  startNoseCountdown,
  startRockPaperScissors,
  startSimultaneousVote,
  startWinClaimVote,
  swapPositionAndHand,
  updatePlayer,
  winAllAlivePlayers,
} from "./state.js";
import type { EngineResult, SideEffect } from "./types.js";

/**
 * Cartes manuelles "réflexe instantané" (contrairement aux règles manuelles
 * permanentes comme Moi/Toi/Zombies) : l'infraction se constate au moment même
 * où la carte est jouée, pas plusieurs tours après — voir `GameState.openReflexCardId`,
 * fermé à la fin du tour dans `index.ts`. Liste fermée, même principe que les
 * autres listes par nom déjà utilisées dans le moteur (ex: "Bombe" dans state.ts).
 * "Nez à nez"/"Pied de nez" en sont sorties une fois automatisées via
 * `START_NOSE_COUNTDOWN` (décompte + résolution automatique, plus besoin de dénonciation).
 */
const REFLEX_CARD_NAMES = new Set(["Index réflexe"]);

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

/**
 * Résout le placement par défaut + les effets non-interactifs d'une carte
 * jouée "pour le compte" d'un joueur, en dehors du flux normal de `playCard()`
 * (turn-order, Patate chaude...) — réservé à "Ninjas" (vol + jeu forcé
 * immédiat). Ignore toujours `CANCEL_LAST_PLAYED_CARD` (mode interruption),
 * qui n'a pas de sens dans un jeu forcé. Idem pour `claimWin` (toujours
 * `undefined`, pas de choix interactif possible dans un jeu forcé) : une
 * "Vous avez gagné !" volée résout automatiquement sur les points de repli.
 */
function resolveForcedCardPlay(
  state: GameState,
  card: Card,
  playerId: PlayerId,
  defaultTargetId: PlayerId,
): EngineResult {
  const sideEffects: SideEffect[] = [];
  let next = removeFromHand(state, playerId, card.id);

  const wantsTargetPlacement = card.effects.some((e) => e.type === "PLACE_IN_FRONT_OF_TARGET");
  const wantsDiscardInsteadOfPlace = card.effects.some((e) => e.type === "DISCARD_SELF");
  if (wantsTargetPlacement && isProtectedByDinosaur(next, defaultTargetId)) {
    throw new GameLogicError(
      "Ce joueur a un Dinosaure en jeu : aucune carte ne peut être placée devant lui",
      "TARGET_PROTECTED",
      { cardId: card.id, targetPlayerId: defaultTargetId },
    );
  }
  const effectTargetId = wantsTargetPlacement ? defaultTargetId : undefined;

  let placementTargetId: PlayerId | null = null;
  if (wantsDiscardInsteadOfPlace) {
    next = { ...next, discardPile: [...next.discardPile, card] };
    sideEffects.push({ type: "CARD_DISCARDED_AFTER_PLAY", playerId, cardId: card.id });
  } else {
    placementTargetId = wantsTargetPlacement ? defaultTargetId : playerId;
    next = placeInFrontOf(next, placementTargetId, card);
    sideEffects.push({ type: "CARD_MOVED_TO_PLAYED", playerId: placementTargetId, cardId: card.id });
    if (REFLEX_CARD_NAMES.has(card.name)) {
      next = { ...next, openReflexCardId: card.id };
    }
  }

  for (const effect of card.effects) {
    if (effect.type === "CANCEL_LAST_PLAYED_CARD") continue;
    const result = applyOneEffect(next, effect, card, playerId, effectTargetId, undefined, undefined, undefined);
    next = result.state;
    sideEffects.push(...result.sideEffects);
    if (next.phase === "ended") break;
  }

  if (placementTargetId) {
    next = { ...next, lastPlayedCard: { cardId: card.id, holderId: placementTargetId } };
  }

  return { state: next, sideEffects };
}

function applyOneEffect(
  state: GameState,
  effect: AutomatedEffect,
  card: Card,
  playerId: PlayerId,
  targetPlayerId: PlayerId | undefined,
  shuffledDrawPileOrder: Card[] | undefined,
  stolenCardId: CardId | undefined,
  claimWin: boolean | undefined,
): EngineResult {
  switch (effect.type) {
    case "DRAW_CARDS":
      return drawCards(state, playerId, effect.count);

    case "PLAY_AGAIN":
      // Autorise une carte de plus ce tour-ci (voir GameState.hasPlayedThisTurn).
      return { state: { ...state, hasPlayedThisTurn: false }, sideEffects: [{ type: "PLAY_AGAIN_GRANTED", playerId }] };

    case "SKIP_NEXT_TURN": {
      const skippedId = targetPlayerId ?? playerId;
      const next = updatePlayer(state, skippedId, (p) => ({ ...p, skipTurns: p.skipTurns + 1 }));
      return { state: next, sideEffects: [{ type: "TURN_SKIP_SCHEDULED", playerId: skippedId }] };
    }

    case "SKIP_OWN_NEXT_TURNS": {
      const next = updatePlayer(state, playerId, (p) => ({ ...p, skipTurns: p.skipTurns + effect.count }));
      return { state: next, sideEffects: [{ type: "TURN_SKIP_SCHEDULED", playerId }] };
    }

    case "ELIMINATE_SELF":
      return eliminatePlayer(state, playerId);

    case "ELIMINATE_TARGET": {
      if (!targetPlayerId) {
        throw new GameLogicError("Cet effet nécessite un joueur cible", "MISSING_TARGET", { cardId: card.id });
      }
      return eliminatePlayer(state, targetPlayerId);
    }

    case "ADD_POINTS":
      return addPoints(state, playerId, effect.amount);

    case "SET_POINTS_TO_WIN":
      return { state: setPointsToWin(state, effect.value), sideEffects: [] };

    case "CHECK_BOARD_ELIMINATION": {
      const count = countCardOnBoard(state, effect.cardName);
      if (count >= effect.threshold) {
        return eliminateAllAlivePlayers(state);
      }
      return { state, sideEffects: [] };
    }

    case "REDIRECT_NAMED_CARD_OR_DRAW": {
      const actingPlayer = state.players.find((p) => p.id === playerId);
      const matchIndex = actingPlayer?.playedCards.findIndex((c) => effect.matchNames.includes(c.name)) ?? -1;

      if (matchIndex === -1) {
        return drawCards(state, playerId, effect.drawCountIfNone);
      }
      if (!targetPlayerId) {
        throw new GameLogicError("Rediriger cette carte nécessite un joueur cible", "MISSING_TARGET", {
          cardId: card.id,
        });
      }

      const movedCard = actingPlayer!.playedCards[matchIndex]!;
      let next = updatePlayer(state, playerId, (p) => ({
        ...p,
        playedCards: p.playedCards.filter((_, i) => i !== matchIndex),
      }));
      next = updatePlayer(next, targetPlayerId, (p) => ({ ...p, playedCards: [...p.playedCards, movedCard] }));

      return { state: next, sideEffects: [{ type: "CARD_MOVED_TO_PLAYED", playerId: targetPlayerId, cardId: movedCard.id }] };
    }

    // Marqueur passif, vérifié à la fin du tour (voir checkEndOfTurnDanger dans state.ts).
    case "ELIMINATE_AT_END_OF_TURN_IF_PRESENT":
      return { state, sideEffects: [] };

    // Marqueur passif, vérifié de façon centrale après chaque event (voir
    // applyDemonicLaughterTriggers dans index.ts) — rien à faire au moment de jouer la carte.
    case "DRAW_ON_ANY_ELIMINATION":
      return { state, sideEffects: [] };

    // Marqueur passif, dérivé du plateau via isDrawPileLocked() (state.ts) —
    // rien à faire au moment de jouer la carte, elle est déjà placée sur la
    // table par le placement par défaut de playCard().
    case "LOCK_DRAW_PILE":
      return { state, sideEffects: [] };

    // Marqueur passif : l'action de vol elle-même passe par l'event dédié
    // STEAL_PLAYED_CARD (voir stealPlayedCard() dans state.ts), pas par ici.
    case "STEAL_ON_TURN_START":
      return { state, sideEffects: [] };

    // Marqueur passif : le passage obligatoire passe par l'event dédié
    // PASS_HOT_POTATO (voir passHotPotato() dans state.ts) ; l'élimination en
    // cas d'oubli est vérifiée en tête de playCard(), pas ici.
    case "MUST_PASS_BEFORE_PLAYING":
      return { state, sideEffects: [] };

    // Marqueur passif, vérifié au moment de résoudre le placement ciblé dans
    // playCard() (voir isProtectedByDinosaur dans state.ts) — rien à faire ici.
    case "BLOCK_INCOMING_PLACEMENT":
      return { state, sideEffects: [] };

    case "RESHUFFLE_ALL_HANDS_AND_REDRAW": {
      if (!shuffledDrawPileOrder) {
        throw new GameLogicError("Cet effet nécessite un ordre de pioche mélangé (calculé côté service)", "MISSING_SHUFFLED_ORDER", {
          cardId: card.id,
        });
      }
      return reshuffleAllHandsAndRedraw(state, shuffledDrawPileOrder, effect.count);
    }

    // Déjà géré par playCard() : la carte part à la défausse au lieu du
    // placement par défaut, avant même que la boucle d'effets ne s'exécute.
    case "DISCARD_SELF":
      return { state, sideEffects: [] };

    case "REACT_TO_OTHER_PLAYER_VICTORY":
      return reactToVictory(state, playerId);

    // Arme le marqueur différé (voir checkFinito dans state.ts, appelé depuis
    // index.ts sur TURN_ENDED) — rien à faire d'autre au moment de jouer la carte.
    case "SCHEDULE_ELIMINATE_ALL_NEXT_TURN_END":
      return { state: scheduleFinito(state, playerId), sideEffects: [] };

    case "REVEAL_BOMBS_AND_WIN_IF_ENOUGH":
      return revealBombsAndWinIfEnough(state, playerId, effect.threshold);

    // Marqueur passif, vérifié dans advanceTurn() (turns.ts), pas ici — rien à
    // faire au moment de jouer la carte au-delà du placement par défaut.
    case "REVERSE_DIRECTION_AND_SKIP_IF_PRESENT":
      return { state, sideEffects: [] };

    // Marqueur passif : l'aléatoire (quelle carte, quelle cible) et le
    // déclenchement (à chaque tour) sont entièrement gérés côté service (voir
    // maybeForceRandomPlay dans game-service.ts) — rien à faire ici.
    case "FORCE_RANDOM_CARD_EACH_TURN":
      return { state, sideEffects: [] };

    case "STEAL_RANDOM_CARD_AND_FORCE_PLAY": {
      if (!targetPlayerId) {
        throw new GameLogicError("Cet effet nécessite un joueur cible", "MISSING_TARGET", { cardId: card.id });
      }
      // Main de la cible vide (rien à voler) : le service ne calcule alors pas
      // stolenCardId — rien ne se passe, pas d'erreur.
      if (!stolenCardId) {
        return { state, sideEffects: [] };
      }
      const target = findPlayer(state, targetPlayerId);
      const stolenCard = target.hand.find((c) => c.id === stolenCardId);
      if (!stolenCard) {
        throw new GameLogicError("La carte volée n'est plus dans la main de ce joueur", "STOLEN_CARD_NOT_IN_HAND", {
          cardId: card.id,
          targetPlayerId,
          stolenCardId,
        });
      }

      let next = updatePlayer(state, targetPlayerId, (p) => ({
        ...p,
        hand: p.hand.filter((c) => c.id !== stolenCardId),
      }));
      next = updatePlayer(next, playerId, (p) => ({ ...p, hand: [...p.hand, stolenCard] }));

      const forcedResult = resolveForcedCardPlay(next, stolenCard, playerId, targetPlayerId);
      return {
        state: forcedResult.state,
        sideEffects: [
          { type: "CARD_STOLEN_AND_FORCE_PLAYED", playerId, targetPlayerId, cardId: stolenCard.id },
          ...forcedResult.sideEffects,
        ],
      };
    }

    case "WIN_IF_ALIVE_COUNT": {
      const aliveCount = state.players.filter((p) => !p.isEliminated).length;
      if (aliveCount !== effect.count) {
        return { state, sideEffects: [] };
      }
      return {
        state: { ...state, phase: "ended", winnerIds: [playerId] },
        sideEffects: [{ type: "GAME_WON", winnerIds: [playerId] }],
      };
    }

    case "WIN_ALL_ALIVE_PLAYERS":
      return winAllAlivePlayers(state);

    case "SWAP_POSITION_AND_HAND": {
      if (!targetPlayerId) {
        throw new GameLogicError("Cet effet nécessite un joueur cible", "MISSING_TARGET", { cardId: card.id });
      }
      const next = swapPositionAndHand(state, playerId, targetPlayerId);
      return { state: next, sideEffects: [{ type: "POSITION_AND_HAND_SWAPPED", playerId, targetPlayerId }] };
    }

    case "GIVE_CARDS_TO_TARGET": {
      if (!targetPlayerId) {
        throw new GameLogicError("Cet effet nécessite un joueur cible", "MISSING_TARGET", { cardId: card.id });
      }
      const actingPlayer = findPlayer(state, playerId);
      const actualCount = Math.min(effect.count, actingPlayer.hand.length);
      const givenCards = actingPlayer.hand.slice(0, actualCount);

      let next = updatePlayer(state, playerId, (p) => ({ ...p, hand: p.hand.slice(actualCount) }));
      next = updatePlayer(next, targetPlayerId, (p) => ({ ...p, hand: [...p.hand, ...givenCards] }));

      return { state: next, sideEffects: [{ type: "CARDS_GIVEN", playerId: targetPlayerId, count: actualCount }] };
    }

    case "REACT_TO_OWN_ELIMINATION": {
      const revived = updatePlayer(state, playerId, (p) => ({ ...p, isEliminated: false }));
      const drawResult = drawCards(revived, playerId, 1);
      return {
        state: drawResult.state,
        sideEffects: [{ type: "ELIMINATION_REVERSED", playerId }, ...drawResult.sideEffects],
      };
    }

    case "REACT_TO_GROUP_ELIMINATION": {
      if (!targetPlayerId) {
        throw new GameLogicError("Cet effet nécessite de désigner un joueur du groupe éliminé", "MISSING_TARGET", {
          cardId: card.id,
        });
      }
      if (!state.lastEliminationBatch?.includes(targetPlayerId)) {
        throw new GameLogicError(
          "Le joueur désigné ne fait pas partie du groupe éliminé ensemble",
          "INVALID_GROUP_ELIMINATION_TARGET",
          { cardId: card.id, targetPlayerId },
        );
      }
      return reactToGroupElimination(state, targetPlayerId);
    }

    case "CANCEL_LAST_PLAYED_CARD":
      return cancelLastPlayedCard(state, playerId);

    case "START_SIMULTANEOUS_VOTE": {
      const next = startSimultaneousVote(state, card.id, playerId, effect.onYes, effect.onNo);
      return { state: next, sideEffects: [{ type: "VOTE_STARTED", cardId: card.id }] };
    }

    case "START_MAJORITY_VOTE_CAKE_OR_GRAVE": {
      const next = startCakeOrGraveVote(state, card.id, playerId);
      return { state: next, sideEffects: [{ type: "VOTE_STARTED", cardId: card.id }] };
    }

    case "START_MAJORITY_VOTE_DEATH_OR_TCHI": {
      const next = startDeathOrTchiVote(state, card.id);
      return { state: next, sideEffects: [{ type: "VOTE_STARTED", cardId: card.id }] };
    }

    case "START_ROCK_PAPER_SCISSORS": {
      const next = startRockPaperScissors(state, card.id, playerId, effect.losingShape);
      return { state: next, sideEffects: [{ type: "CHOICE_STARTED", cardId: card.id }] };
    }

    case "START_FINGER_COUNT_CHALLENGE": {
      const next = startFingerCountChallenge(state, card.id, playerId);
      return { state: next, sideEffects: [{ type: "CHOICE_STARTED", cardId: card.id }] };
    }

    case "START_NOSE_COUNTDOWN": {
      const next = startNoseCountdown(state, card.id, playerId, effect.seconds, effect.eliminateIfTouching);
      return { state: next, sideEffects: [{ type: "NOSE_COUNTDOWN_STARTED", seconds: effect.seconds }] };
    }

    case "START_HAND_SLAP": {
      const next = startHandSlap(state, card.id, playerId, effect.mode);
      return { state: next, sideEffects: [{ type: "HAND_SLAP_STARTED", cardId: card.id }] };
    }

    case "WIN_IF_CONDITION_ELSE_POINTS": {
      if (!claimWin) {
        return addPoints(state, playerId, effect.fallbackPoints);
      }
      if (effect.condition.kind === "bombsOnBoard") {
        return hasEnoughBombsOnBoard(state, effect.condition.threshold) ? declareWinners(state, [playerId]) : { state, sideEffects: [] };
      }
      if (effect.condition.kind === "noStarCardInAnyHand") {
        return noPlayerHasStarCardInHand(state) ? declareWinners(state, [playerId]) : { state, sideEffects: [] };
      }
      // condition.kind === "socialVote" : pas vérifiable par le serveur, ouvre un vote à majorité.
      const next = startWinClaimVote(state, card.id, playerId, effect.condition.description);
      return { state: next, sideEffects: [{ type: "VOTE_STARTED", cardId: card.id }] };
    }

    // Déjà géré par le placement par défaut dans playCard().
    case "PLACE_IN_FRONT_OF_SELF":
    case "PLACE_IN_FRONT_OF_TARGET":
      return { state, sideEffects: [] };

    default: {
      const exhaustiveCheck: never = effect;
      throw new GameLogicError("Effet automatisé inconnu", "UNKNOWN_EFFECT", { effect: exhaustiveCheck });
    }
  }
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

  // Cartes réactives (ex: Vie supplémentaire, Gros nul !) : jouables hors tour,
  // sous condition d'éligibilité propre à l'effet — elles ne suivent pas l'ordre normal.
  const isReactiveToOwnElimination = card.effects.some((e) => e.type === "REACT_TO_OWN_ELIMINATION");
  const isReactiveToGroupElimination = card.effects.some((e) => e.type === "REACT_TO_GROUP_ELIMINATION");
  const isReactiveToVictory = card.effects.some((e) => e.type === "REACT_TO_OTHER_PLAYER_VICTORY");
  const canBePlayedAsInterrupt = card.effects.some((e) => e.type === "CANCEL_LAST_PLAYED_CARD");
  const playedAsInterrupt = event.playedAsInterrupt === true;

  if (playedAsInterrupt) {
    // "À tout moment" (ex: Embuscade de chatons) : aucune contrainte de tour, mais
    // uniquement pour une carte qui porte réellement cet effet, et s'il y a bien
    // une carte sur la table à annuler.
    if (!canBePlayedAsInterrupt) {
      throw new GameLogicError("Cette carte ne peut pas être jouée en interruption", "NOT_INTERRUPT_CAPABLE", {
        playerId: event.playerId,
        cardId: card.id,
      });
    }
  } else if (isReactiveToOwnElimination) {
    if (!player.isEliminated) {
      throw new GameLogicError("Cette carte ne peut être jouée que si vous êtes éliminé", "NOT_ELIGIBLE_FOR_REACTION", {
        playerId: event.playerId,
        cardId: card.id,
      });
    }
  } else if (isReactiveToGroupElimination) {
    if (!player.isEliminated || !state.lastEliminationBatch?.includes(player.id)) {
      throw new GameLogicError(
        "Cette carte ne peut être jouée que juste après avoir été éliminé en groupe avec au moins un autre joueur",
        "NOT_ELIGIBLE_FOR_REACTION",
        { playerId: event.playerId, cardId: card.id },
      );
    }
  } else if (isReactiveToVictory) {
    // "Enfoiré !" : seule carte jouable après phase === "ended" (voir le
    // contournement dédié dans index.ts) — uniquement si un seul joueur vient
    // de gagner, que ce n'est pas le porteur lui-même, et qu'il n'est pas éliminé.
    if (state.phase !== "ended" || !state.winnerIds || state.winnerIds.length !== 1) {
      throw new GameLogicError(
        "Cette carte ne peut être jouée que juste après qu'un seul joueur ait gagné la partie",
        "NOT_ELIGIBLE_FOR_REACTION",
        { playerId: event.playerId, cardId: card.id },
      );
    }
    if (state.winnerIds[0] === player.id) {
      throw new GameLogicError("Impossible de jouer cette carte contre sa propre victoire", "NOT_ELIGIBLE_FOR_REACTION", {
        playerId: event.playerId,
        cardId: card.id,
      });
    }
    if (player.isEliminated) {
      throw new GameLogicError(
        "Cette carte ne peut être jouée que si le vainqueur ne vous a pas éliminé",
        "NOT_ELIGIBLE_FOR_REACTION",
        { playerId: event.playerId, cardId: card.id },
      );
    }
  } else if (state.currentPlayerId !== event.playerId) {
    throw new GameLogicError("Ce n'est pas le tour de ce joueur", "NOT_YOUR_TURN", {
      playerId: event.playerId,
      currentPlayerId: state.currentPlayerId,
    });
  }

  // Une carte "normale" au sens de la règle "1 carte par tour" — ni réactive
  // (jouable hors tour), ni une interruption (ex: Embuscade de chatons "à
  // tout moment"), qui échappent toutes les deux au tour classique.
  const isNormalTurnPlay =
    !playedAsInterrupt && !isReactiveToOwnElimination && !isReactiveToGroupElimination && !isReactiveToVictory;

  // "Patate chaude" : oubli de la passer avant de jouer une carte à son tour
  // normal -> élimination immédiate à la place de l'action prévue (ne concerne
  // pas les cartes réactives/interruption, qui ne sont pas "jouer à son tour").
  if (isNormalTurnPlay) {
    const hasHotPotato = player.playedCards.some((c) => c.effects.some((e) => e.type === "MUST_PASS_BEFORE_PLAYING"));
    if (hasHotPotato) {
      return eliminatePlayer(state, player.id);
    }
  }

  // Règle officielle : 1 carte par tour, sauf exception explicite (Bombe,
  // Tricheur... qui accordent PLAY_AGAIN, voir plus bas). Ne s'applique
  // jamais aux cartes réactives/interruption, qui ne comptent pas comme
  // "la carte du tour".
  if (isNormalTurnPlay && state.hasPlayedThisTurn) {
    throw new GameLogicError("Une seule carte par tour (sauf effet qui accorde de rejouer)", "ALREADY_PLAYED_THIS_TURN", {
      playerId: event.playerId,
      cardId: card.id,
    });
  }

  // La fenêtre de réaction "Gros nul !" se referme dès qu'une autre carte est
  // jouée (elle-même exceptée) — voir GameState.lastEliminationBatch.
  let next = isReactiveToGroupElimination ? state : clearEliminationBatch(state);
  next = removeFromHand(next, player.id, card.id);
  const sideEffects: SideEffect[] = [];

  const wantsTargetPlacement = card.effects.some((e) => e.type === "PLACE_IN_FRONT_OF_TARGET");
  const wantsDiscardInsteadOfPlace = card.effects.some((e) => e.type === "DISCARD_SELF");
  if (wantsTargetPlacement && !event.targetPlayerId) {
    throw new GameLogicError("Cet effet nécessite un joueur cible", "MISSING_TARGET", { cardId: card.id });
  }
  // "Dinosaure" : personne ne peut placer une carte devant un joueur qui en a
  // une en jeu (ne concerne que le placement ciblé, jamais le porteur lui-même).
  if (wantsTargetPlacement && event.targetPlayerId && isProtectedByDinosaur(state, event.targetPlayerId)) {
    throw new GameLogicError(
      "Ce joueur a un Dinosaure en jeu : aucune carte ne peut être placée devant lui",
      "TARGET_PROTECTED",
      { cardId: card.id, targetPlayerId: event.targetPlayerId },
    );
  }

  // "Politique" : part directement à la défausse commune, jamais dans une pile
  // personnelle — pas de "dernière carte jouée" possible à annuler pour elle.
  let placementTargetId: PlayerId | null = null;
  if (wantsDiscardInsteadOfPlace) {
    next = { ...next, discardPile: [...next.discardPile, card] };
    sideEffects.push({ type: "CARD_DISCARDED_AFTER_PLAY", playerId: player.id, cardId: card.id });
  } else {
    placementTargetId = wantsTargetPlacement ? (event.targetPlayerId as PlayerId) : player.id;
    next = placeInFrontOf(next, placementTargetId, card);
    sideEffects.push({ type: "CARD_MOVED_TO_PLAYED", playerId: placementTargetId, cardId: card.id });
    if (REFLEX_CARD_NAMES.has(card.name)) {
      next = { ...next, openReflexCardId: card.id };
    }
  }
  // Consomme la carte du tour — un éventuel PLAY_AGAIN dans la boucle
  // d'effets ci-dessous remet ce marqueur à `false` pour autoriser une carte
  // de plus (voir le case "PLAY_AGAIN" dans applyOneEffect).
  if (isNormalTurnPlay) {
    next = { ...next, hasPlayedThisTurn: true };
  }

  const lastPlayedCardBeforeEffects = next.lastPlayedCard;
  for (const effect of card.effects) {
    // Cartes à double usage (CANCEL_LAST_PLAYED_CARD) : seul l'effet correspondant
    // au mode choisi s'applique — l'autre (ex: DRAW_CARDS pour la variante normale)
    // est ignoré pour cette carte-là. N'affecte aucune autre carte du jeu.
    const isInterruptEffect = effect.type === "CANCEL_LAST_PLAYED_CARD";
    if (playedAsInterrupt !== isInterruptEffect) continue;
    const result = applyOneEffect(
      next,
      effect,
      card,
      player.id,
      event.targetPlayerId,
      event.shuffledDrawPileOrder,
      event.stolenCardId,
      event.claimWin,
    );
    next = result.state;
    sideEffects.push(...result.sideEffects);
    // Vérifié APRÈS chaque effet (pas avant) : sinon "Enfoiré !", qui se joue
    // alors que `state.phase` est déjà "ended", verrait son propre effet ignoré
    // avant même d'avoir pu s'exécuter.
    if (next.phase === "ended" && !isReactiveToVictory) break;
  }

  // "Dernière carte jouée" : mis à jour APRÈS avoir résolu les effets ci-dessus
  // (donc lu à sa valeur précédente par CANCEL_LAST_PLAYED_CARD), pour toute
  // carte placée dans une pile personnelle (pas pour "Politique", défaussée).
  // Sauf si un effet imbriqué (ex: Ninjas, STEAL_RANDOM_CARD_AND_FORCE_PLAY) l'a
  // déjà mis à jour lui-même pendant la boucle — dans ce cas la carte volée,
  // placée APRÈS Ninjas elle-même, est bien la plus récente sur la table.
  if (placementTargetId && next.lastPlayedCard === lastPlayedCardBeforeEffects) {
    next = { ...next, lastPlayedCard: { cardId: card.id, holderId: placementTargetId } };
  }

  return { state: next, sideEffects };
}
