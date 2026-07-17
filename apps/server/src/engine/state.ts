import type { Card, GameState, Player, PlayerId, RoomId } from "@card-game/shared-types";
import { STARTING_HAND_SIZE } from "@card-game/shared-types";
import { GameLogicError } from "./errors.js";
import type { EngineResult, SideEffect } from "./types.js";

export function createInitialState(roomId: RoomId): GameState {
  return {
    roomId,
    phase: "lobby",
    players: [],
    currentPlayerId: null,
    drawPile: [],
    discardPile: [],
    winnerId: null,
  };
}

export function findPlayer(state: GameState, playerId: PlayerId): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new GameLogicError(`Joueur ${playerId} introuvable`, "PLAYER_NOT_FOUND", { playerId });
  }
  return player;
}

/** Remplace un joueur par sa version mise à jour (immuable). */
export function updatePlayer(state: GameState, playerId: PlayerId, update: (player: Player) => Player): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? update(p) : p)),
  };
}

export function addPlayer(state: GameState, playerId: PlayerId, name: string): GameState {
  if (state.phase !== "lobby") {
    throw new GameLogicError("Impossible de rejoindre une partie déjà commencée", "GAME_ALREADY_STARTED", {
      phase: state.phase,
    });
  }
  const newPlayer: Player = {
    id: playerId,
    name,
    hand: [],
    playedCards: [],
    isEliminated: false,
    points: 0,
    skipNextTurn: false,
  };
  return { ...state, players: [...state.players, newPlayer] };
}

/** Distribue la main de départ à chaque joueur depuis le deck déjà mélangé (voir GameStartedEvent). */
export function startGame(state: GameState, deck: Card[]): GameState {
  let remainingDeck = deck;
  const players = state.players.map((player) => {
    const hand = remainingDeck.slice(0, STARTING_HAND_SIZE);
    remainingDeck = remainingDeck.slice(STARTING_HAND_SIZE);
    return { ...player, hand };
  });

  return {
    ...state,
    phase: "playing",
    players,
    currentPlayerId: players[0]?.id ?? null,
    drawPile: remainingDeck,
  };
}

export function drawCards(state: GameState, playerId: PlayerId, count: number): EngineResult {
  const actualCount = Math.min(count, state.drawPile.length);
  const drawnCards = state.drawPile.slice(0, actualCount);
  const remainingDrawPile = state.drawPile.slice(actualCount);

  const next = updatePlayer(
    { ...state, drawPile: remainingDrawPile },
    playerId,
    (p) => ({ ...p, hand: [...p.hand, ...drawnCards] }),
  );

  const sideEffects: SideEffect[] = [{ type: "CARDS_DRAWN", playerId, count: actualCount }];
  return { state: next, sideEffects };
}

/**
 * Élimine un joueur puis vérifie la condition de victoire : dernier joueur non
 * éliminé gagne la partie (règle officielle).
 */
export function eliminatePlayer(state: GameState, playerId: PlayerId, checkWin = true): EngineResult {
  let next = updatePlayer(state, playerId, (p) => ({ ...p, isEliminated: true }));
  const sideEffects: SideEffect[] = [{ type: "PLAYER_ELIMINATED", playerId }];

  if (checkWin) {
    const alive = next.players.filter((p) => !p.isEliminated);
    if (alive.length <= 1) {
      const winnerId = alive[0]?.id ?? null;
      next = { ...next, phase: "ended", winnerId };
      if (winnerId) {
        sideEffects.push({ type: "GAME_WON", winnerId });
      }
    }
  }

  return { state: next, sideEffects };
}
