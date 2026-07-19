import { describe, expect, it } from "vitest";
import type { GameState, Player } from "@card-game/shared-types";
import { extractChoiceReveal } from "../../src/lib/choiceReveal";

function makePlayer(overrides: Partial<Player> & { id: string; name: string }): Player {
  return {
    isEliminated: false,
    hand: [],
    playedCards: [],
    points: 0,
    skipTurns: 0,
    ...overrides,
  } as Player;
}

function makeState(players: Player[]): GameState {
  return {
    roomId: "room-1",
    phase: "playing",
    players,
    currentPlayerId: players[0]?.id ?? null,
    drawPile: [],
    discardPile: [],
    winnerIds: null,
    pointsToWin: 15,
  } as unknown as GameState;
}

describe("extractChoiceReveal", () => {
  const state = makeState([
    makePlayer({ id: "p1", name: "Alice" }),
    makePlayer({ id: "p2", name: "Bob" }),
  ]);

  it("retourne null sans sideEffects", () => {
    expect(extractChoiceReveal(state, undefined)).toBeNull();
  });

  it("retourne null si aucun side effect pertinent", () => {
    expect(extractChoiceReveal(state, [{ type: "CARDS_DRAWN", playerId: "p1" }])).toBeNull();
  });

  it("résout les noms des joueurs pour VOTES_REVEALED", () => {
    const reveal = extractChoiceReveal(state, [
      { type: "VOTES_REVEALED", votes: { p1: "oui", p2: "non" } } as never,
    ]);
    expect(reveal).toEqual({
      title: "Résultat du vote",
      entries: [
        { name: "Alice", label: "Oui" },
        { name: "Bob", label: "Non" },
      ],
    });
  });

  it("résout les noms des joueurs pour CHOICES_REVEALED avec libellés pierre/feuille/ciseaux", () => {
    const reveal = extractChoiceReveal(state, [
      { type: "CHOICES_REVEALED", choices: { p1: "pierre", p2: "ciseaux" } } as never,
    ]);
    expect(reveal).toEqual({
      title: "Résultat du choix",
      entries: [
        { name: "Alice", label: "🪨 Pierre" },
        { name: "Bob", label: "✂️ Ciseaux" },
      ],
    });
  });

  it("passe une valeur inconnue telle quelle (ex: Chiffre)", () => {
    const reveal = extractChoiceReveal(state, [
      { type: "CHOICES_REVEALED", choices: { p1: "3" } } as never,
    ]);
    expect(reveal?.entries).toEqual([{ name: "Alice", label: "3" }]);
  });
});
