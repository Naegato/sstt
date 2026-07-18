import { describe, expect, it } from "bun:test";
import type { Card } from "@card-game/shared-types";
import { buildBalancedDeck } from "../../src/content/deck-builder.js";

function makeCard(id: string, rarity: Card["rarity"] = "normale"): Card {
  return { id, name: id, rarity, text: "", effects: [] };
}

/** Générateur pseudo-aléatoire déterministe (LCG), pour des tests reproductibles. */
function makeSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe("buildBalancedDeck", () => {
  it("conserve toutes les cartes (aucune perdue, aucune dupliquée)", () => {
    const normale = Array.from({ length: 56 }, (_, i) => makeCard(`n${i}`));
    const etoile = Array.from({ length: 17 }, (_, i) => makeCard(`e${i}`, "etoile"));
    const deck = buildBalancedDeck([...normale, ...etoile], makeSeededRandom(42));

    expect(deck.length).toBe(73);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(73);
  });

  it("répartit les cartes Étoile sur toute la longueur du deck, pas regroupées", () => {
    const normale = Array.from({ length: 56 }, (_, i) => makeCard(`n${i}`));
    const etoile = Array.from({ length: 17 }, (_, i) => makeCard(`e${i}`, "etoile"));
    const deck = buildBalancedDeck([...normale, ...etoile], makeSeededRandom(7));

    const starPositions = deck.map((c, i) => (c.rarity === "etoile" ? i : -1)).filter((i) => i !== -1);
    expect(starPositions.length).toBe(17);

    // Aucun écart entre deux cartes Étoile consécutives ne doit dépasser ~2x la
    // taille moyenne d'un segment (73/17 ≈ 4.3) — sinon elles seraient regroupées.
    const averageGap = deck.length / etoile.length;
    for (let i = 1; i < starPositions.length; i++) {
      const gap = starPositions[i]! - starPositions[i - 1]!;
      expect(gap).toBeLessThanOrEqual(averageGap * 2.5);
    }

    // La première carte Étoile ne doit pas être anormalement loin du début.
    expect(starPositions[0]).toBeLessThanOrEqual(averageGap * 2);
    // La dernière ne doit pas être anormalement loin de la fin.
    expect(deck.length - 1 - starPositions[starPositions.length - 1]!).toBeLessThanOrEqual(averageGap * 2);
  });

  it("reste déterministe pour un générateur aléatoire donné (testabilité)", () => {
    const cards = [makeCard("n1"), makeCard("n2"), makeCard("e1", "etoile"), makeCard("e2", "etoile")];
    const deck1 = buildBalancedDeck(cards, makeSeededRandom(123));
    const deck2 = buildBalancedDeck(cards, makeSeededRandom(123));

    expect(deck1.map((c) => c.id)).toEqual(deck2.map((c) => c.id));
  });

  it("fonctionne sans carte Étoile (juste un mélange normal)", () => {
    const normale = Array.from({ length: 10 }, (_, i) => makeCard(`n${i}`));
    const deck = buildBalancedDeck(normale, makeSeededRandom(1));

    expect(deck.length).toBe(10);
    expect(deck.every((c) => c.rarity === "normale")).toBe(true);
  });
});
