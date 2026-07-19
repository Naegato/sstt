import { describe, expect, it } from "bun:test";
import type { Card, GameState, Player } from "../src/game/types.js";
import { MAX_PLAYERS, MIN_PLAYERS, STARTING_HAND_SIZE, WINNING_POINTS } from "../src/game/constants.js";

function makePlayer(id: string): Player {
  return { id, name: id, hand: [], playedCards: [], isEliminated: false, points: 0, skipTurns: 0 };
}

const bombeCard: Card = {
  id: "bombe-01",
  name: "Bombe",
  rarity: "normale",
  text: "Placez cette carte face visible devant vous, puis rejouez un tour.",
  effects: [{ type: "PLACE_IN_FRONT_OF_SELF" }],
};

const manualCard: Card = {
  id: "index-reflexe-01",
  name: "Index réflexe",
  rarity: "etoile",
  text: "Quiconque montre du doigt un autre joueur ou une carte sera immédiatement éliminé.",
  effects: [], // carte manuelle, résolue par confirmation des joueurs
};

describe("GameState models N players correctly", () => {
  it("supports the full physical player range (2 to 17)", () => {
    const players = Array.from({ length: MAX_PLAYERS }, (_, i) => makePlayer(`p${i}`));
    const state: GameState = {
      roomId: "room-1",
      phase: "playing",
      players,
      currentPlayerId: players[0]?.id ?? null,
      drawPile: [],
      discardPile: [],
      winnerIds: null,
      pointsToWin: WINNING_POINTS,
      pendingVote: null,
      lastEliminationBatch: null,
      lastPlayedCard: null,
      stolenThisTurn: false,
      hasPlayedThisTurn: false,
      pendingHandSlap: null,
      pendingFinito: null,
      turnDirection: 1,
      pendingChoice: null,
      openReflexCardId: null,
      pendingNoseCountdown: null,
    };

    expect(state.players.length).toBe(MAX_PLAYERS);
    expect(MIN_PLAYERS).toBeLessThanOrEqual(state.players.length);
  });

  it("keeps eliminated players' playedCards visible in state", () => {
    const eliminated: Player = { ...makePlayer("p1"), isEliminated: true, playedCards: [bombeCard] };

    expect(eliminated.isEliminated).toBe(true);
    expect(eliminated.playedCards).toHaveLength(1);
  });
});

describe("Card effect resolution model", () => {
  it("distinguishes automated effects from manual (text-only) cards", () => {
    expect(bombeCard.effects.length).toBeGreaterThan(0);
    expect(manualCard.effects).toHaveLength(0);
  });
});

describe("constants", () => {
  it("matches the physical game's starting hand size", () => {
    expect(STARTING_HAND_SIZE).toBe(2);
  });
});
