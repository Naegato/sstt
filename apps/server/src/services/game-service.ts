import type { CardId, GameEvent, PlayerId, RoomId } from "@card-game/shared-types";
import { type EngineResult, processEvent } from "../engine/index.js";
import { loadPlayableDeck } from "../content/cards-catalog.js";
import { buildBalancedDeck, shuffleWith } from "../content/deck-builder.js";
import type { RoomManager } from "./room-manager.js";

export class GameService {
  private eventLog = new Map<RoomId, GameEvent[]>();

  constructor(private roomManager: RoomManager) {}

  handleEvent(roomId: RoomId, event: GameEvent): EngineResult {
    const room = this.roomManager.getOrCreateRoom(roomId);
    const result = processEvent(room.state, event);
    this.roomManager.updateState(roomId, result.state);

    const log = this.eventLog.get(roomId) ?? [];
    log.push(event);
    this.eventLog.set(roomId, log);

    return result;
  }

  async startGame(roomId: RoomId): Promise<EngineResult> {
    const deck = await loadPlayableDeck();
    const result = this.handleEvent(roomId, {
      type: "GAME_STARTED",
      timestamp: Date.now(),
      deck: buildBalancedDeck(deck),
    });
    return this.drawForCurrentPlayer(roomId, result);
  }

  playCard(
    roomId: RoomId,
    playerId: PlayerId,
    cardId: CardId,
    targetPlayerId?: PlayerId,
    playedAsInterrupt?: boolean,
  ): EngineResult {
    // "Politique" a besoin d'aléatoire (mélange des mains + de la pioche) : le
    // moteur pur ne mélange jamais lui-même, donc c'est calculé ici, avant de
    // construire l'event (même principe que buildBalancedDeck pour GAME_STARTED).
    const room = this.roomManager.getOrCreateRoom(roomId);
    const player = room.state.players.find((p) => p.id === playerId);
    const card = player?.hand.find((c) => c.id === cardId);
    const needsReshuffle = card?.effects.some((e) => e.type === "RESHUFFLE_ALL_HANDS_AND_REDRAW");
    const shuffledDrawPileOrder = needsReshuffle
      ? shuffleWith(
          [...room.state.drawPile, ...room.state.players.flatMap((p) => p.hand.filter((c) => c.id !== cardId))],
          Math.random,
        )
      : undefined;

    // "Ninjas" a besoin d'aléatoire (1 carte au hasard dans la main de la
    // cible) : le moteur pur ne tire jamais au hasard lui-même, donc c'est
    // calculé ici, même principe que shuffledDrawPileOrder pour Politique.
    const needsRandomSteal = card?.effects.some((e) => e.type === "STEAL_RANDOM_CARD_AND_FORCE_PLAY");
    const targetHand = targetPlayerId ? room.state.players.find((p) => p.id === targetPlayerId)?.hand : undefined;
    const stolenCardId =
      needsRandomSteal && targetHand && targetHand.length > 0
        ? targetHand[Math.floor(Math.random() * targetHand.length)]!.id
        : undefined;

    const result = this.handleEvent(roomId, {
      type: "CARD_PLAYED",
      playerId,
      cardId,
      targetPlayerId,
      playedAsInterrupt,
      shuffledDrawPileOrder,
      stolenCardId,
      timestamp: Date.now(),
    });

    // "Rejouez un tour" (Bombe, Tricheur...) : le même joueur repioche immédiatement,
    // conformément à la règle officielle (un tour = piocher puis jouer).
    const grantsPlayAgain = result.sideEffects.some((e) => e.type === "PLAY_AGAIN_GRANTED");
    if (!grantsPlayAgain) {
      return result;
    }
    return this.drawForCurrentPlayer(roomId, result);
  }

  /**
   * Termine le tour du joueur, puis fait piocher automatiquement le joueur
   * suivant — la règle officielle ("à votre tour, piochez 1 carte, puis jouez
   * 1 carte") ne laisse pas le choix, ce n'est pas une action distincte côté client.
   */
  endTurn(roomId: RoomId, playerId: PlayerId): EngineResult {
    const result = this.handleEvent(roomId, { type: "TURN_ENDED", playerId, timestamp: Date.now() });
    return this.drawForCurrentPlayer(roomId, result);
  }

  /** Action optionnelle "Pingouins" : vole `cardId` dans la pile de `targetPlayerId`, au plus 1 fois par tour. */
  stealPlayedCard(roomId: RoomId, playerId: PlayerId, targetPlayerId: PlayerId, cardId: CardId): EngineResult {
    return this.handleEvent(roomId, {
      type: "STEAL_PLAYED_CARD",
      playerId,
      targetPlayerId,
      cardId,
      timestamp: Date.now(),
    });
  }

  /** Action obligatoire "Patate chaude" : passe la carte au joueur suivant (destinataire déterministe). */
  passHotPotato(roomId: RoomId, playerId: PlayerId): EngineResult {
    return this.handleEvent(roomId, { type: "PASS_HOT_POTATO", playerId, timestamp: Date.now() });
  }

  /** Dénonciation : ouvre un vote à majorité pour éliminer `targetPlayerId` (cartes manuelles non respectées). */
  denouncePlayer(roomId: RoomId, challengerId: PlayerId, targetPlayerId: PlayerId, reason: string): EngineResult {
    return this.handleEvent(roomId, {
      type: "ELIMINATION_CHALLENGED",
      challengerId,
      targetPlayerId,
      reason,
      timestamp: Date.now(),
    });
  }

  /**
   * Confirmation déclarative qu'une carte manuelle (texte affiché, pas
   * d'automatisation) a bien été respectée — pas de transition d'état, juste
   * tracé dans l'historique/replay. Le pendant de `denouncePlayer()` : si
   * d'autres joueurs ne sont pas d'accord malgré cette confirmation, ils
   * peuvent quand même dénoncer.
   */
  confirmManualAction(roomId: RoomId, playerId: PlayerId, cardId: CardId): EngineResult {
    return this.handleEvent(roomId, { type: "MANUAL_ACTION_CONFIRMED", playerId, cardId, timestamp: Date.now() });
  }

  /** "Rejouer une partie" : remet la room en lobby avec les mêmes joueurs (voir resetGameToLobby). */
  resetGame(roomId: RoomId): EngineResult {
    return this.handleEvent(roomId, { type: "GAME_RESET", timestamp: Date.now() });
  }

  private drawForCurrentPlayer(roomId: RoomId, result: EngineResult): EngineResult {
    if (result.state.phase !== "playing" || !result.state.currentPlayerId) {
      return result;
    }
    const drawResult = this.handleEvent(roomId, {
      type: "CARD_DRAWN",
      playerId: result.state.currentPlayerId,
      cardId: "",
      timestamp: Date.now(),
    });
    const merged = { state: drawResult.state, sideEffects: [...result.sideEffects, ...drawResult.sideEffects] };
    return this.maybeForceRandomPlay(roomId, merged);
  }

  /**
   * "Illumination ludique" (FORCE_RANDOM_CARD_EACH_TURN) : si le joueur dont
   * c'est le tour la porte encore, il joue 1 carte au hasard de sa main —
   * aucun choix possible. Aléatoire (carte + cible si besoin) calculé ici, côté
   * service, jamais dans le moteur pur. Réutilise `playCard()` tel quel, donc
   * hérite gratuitement de toutes ses règles (Patate chaude, Dinosaure,
   * Politique, PLAY_AGAIN qui rappelle `drawForCurrentPlayer` donc cette
   * méthode aussi...). Limite assumée : main vide -> rien ne se passe.
   */
  private maybeForceRandomPlay(roomId: RoomId, result: EngineResult): EngineResult {
    if (result.state.phase !== "playing" || !result.state.currentPlayerId) {
      return result;
    }
    const player = result.state.players.find((p) => p.id === result.state.currentPlayerId);
    if (!player || player.hand.length === 0) {
      return result;
    }
    const isIlluminated = player.playedCards.some((c) =>
      c.effects.some((e) => e.type === "FORCE_RANDOM_CARD_EACH_TURN"),
    );
    if (!isIlluminated) {
      return result;
    }

    // Cartes réactives (Vie supplémentaire, Gros nul !, Enfoiré !) ne se jouent
    // jamais normalement à son tour — les exclure du tirage au hasard, sinon
    // playCard() rejetterait le coup forcé (NOT_ELIGIBLE_FOR_REACTION).
    const reactiveOnly = new Set(["REACT_TO_OWN_ELIMINATION", "REACT_TO_GROUP_ELIMINATION", "REACT_TO_OTHER_PLAYER_VICTORY"]);
    const playableNow = player.hand.filter((c) => !c.effects.some((e) => reactiveOnly.has(e.type)));
    if (playableNow.length === 0) {
      return result;
    }

    const randomCard = playableNow[Math.floor(Math.random() * playableNow.length)]!;
    const others = result.state.players.filter((p) => p.id !== player.id && !p.isEliminated);
    const randomTargetId = others.length > 0 ? others[Math.floor(Math.random() * others.length)]!.id : undefined;

    // Cas rare non couvert (ex: cible tirée au hasard protégée par un
    // Dinosaure) : on n'échoue pas tout le tour pour autant, le coup forcé est
    // simplement abandonné pour cette pioche-ci.
    try {
      const playResult = this.playCard(roomId, player.id, randomCard.id, randomTargetId);
      return { state: playResult.state, sideEffects: [...result.sideEffects, ...playResult.sideEffects] };
    } catch {
      return result;
    }
  }

  getEventLog(roomId: RoomId): GameEvent[] {
    return this.eventLog.get(roomId) ?? [];
  }
}
