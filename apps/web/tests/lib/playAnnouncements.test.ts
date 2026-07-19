import { describe, expect, it } from "vitest";
import type { Card as CardType, GameState, Player } from "@card-game/shared-types";
import { extractPlayAnnouncements } from "../../src/lib/playAnnouncements";

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

function makeCard(overrides: Partial<CardType> & { id: string; name: string; text: string }): CardType {
  return { rarity: "normale", effects: [], ...overrides } as CardType;
}

function makeState(players: Player[], discardPile: CardType[] = []): GameState {
  return {
    roomId: "room-1",
    phase: "playing",
    players,
    currentPlayerId: players[0]?.id ?? null,
    drawPile: [],
    discardPile,
    winnerIds: null,
    pointsToWin: 15,
  } as unknown as GameState;
}

describe("extractPlayAnnouncements", () => {
  it("retourne un tableau vide sans sideEffects", () => {
    const state = makeState([makePlayer({ id: "p1", name: "Alice" })]);
    expect(extractPlayAnnouncements(state, undefined)).toEqual([]);
  });

  it("détecte une carte posée (CARD_MOVED_TO_PLAYED), face visible par défaut", () => {
    const bombe = makeCard({ id: "bombe-1", name: "Bombe", text: "Placez cette carte face visible devant vous." });
    const state = makeState([makePlayer({ id: "p1", name: "Alice", playedCards: [bombe] })]);

    const result = extractPlayAnnouncements(state, [{ type: "CARD_MOVED_TO_PLAYED", playerId: "p1", cardId: "bombe-1" }]);

    expect(result).toEqual([{ card: bombe, holderName: "Alice", faceDown: false }]);
  });

  it("détecte une carte face cachée (SANS lire la dernière phrase) via son propre texte", () => {
    const bataille = makeCard({
      id: "bataille-1",
      name: "Bataille",
      rarity: "etoile",
      text: "Lisez la phrase suivante à voix haute, puis posez cette carte face cachée sur la table SANS lire la dernière phrase.",
    });
    const state = makeState([makePlayer({ id: "p1", name: "Alice", playedCards: [bataille] })]);

    const result = extractPlayAnnouncements(state, [{ type: "CARD_MOVED_TO_PLAYED", playerId: "p1", cardId: "bataille-1" }]);

    expect(result).toEqual([{ card: bataille, holderName: "Alice", faceDown: true }]);
  });

  it("détecte une carte défaussée directement (CARD_DISCARDED_AFTER_PLAY, ex: Politique)", () => {
    const politique = makeCard({ id: "politique-1", name: "Politique", text: "Mélangez toutes les mains." });
    const state = makeState([makePlayer({ id: "p1", name: "Alice" })], [politique]);

    const result = extractPlayAnnouncements(state, [{ type: "CARD_DISCARDED_AFTER_PLAY", playerId: "p1", cardId: "politique-1" }]);

    expect(result).toEqual([{ card: politique, holderName: "Alice", faceDown: false }]);
  });

  it("ignore les sideEffects sans rapport (ex: VOTE_CAST)", () => {
    const state = makeState([makePlayer({ id: "p1", name: "Alice" })]);
    expect(extractPlayAnnouncements(state, [{ type: "VOTE_CAST", playerId: "p1" }])).toEqual([]);
  });

  it("conserve l'ordre et gère plusieurs cartes jouées dans la même mise à jour (ex: Ninjas)", () => {
    const ninjas = makeCard({ id: "ninjas-1", name: "Ninjas", text: "Volez une carte au hasard." });
    const voleeCard = makeCard({ id: "volee-1", name: "Zombies", text: "Jouez cette carte face visible devant vous." });
    const state = makeState([
      makePlayer({ id: "p1", name: "Alice", playedCards: [ninjas] }),
      makePlayer({ id: "p2", name: "Bob", playedCards: [voleeCard] }),
    ]);

    const result = extractPlayAnnouncements(state, [
      { type: "CARD_MOVED_TO_PLAYED", playerId: "p1", cardId: "ninjas-1" },
      { type: "CARD_MOVED_TO_PLAYED", playerId: "p2", cardId: "volee-1" },
    ]);

    expect(result).toEqual([
      { card: ninjas, holderName: "Alice", faceDown: false },
      { card: voleeCard, holderName: "Bob", faceDown: false },
    ]);
  });

  it("ignore silencieusement une référence introuvable (joueur ou carte disparue entre-temps)", () => {
    const state = makeState([makePlayer({ id: "p1", name: "Alice" })]);
    const result = extractPlayAnnouncements(state, [{ type: "CARD_MOVED_TO_PLAYED", playerId: "ghost", cardId: "x" }]);
    expect(result).toEqual([]);
  });
});
