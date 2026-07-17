import type { Card } from "@card-game/shared-types";

export function makeCard(overrides: Partial<Card> & Pick<Card, "id">): Card {
  return {
    name: overrides.id,
    rarity: "normale",
    text: "Carte de test.",
    ...overrides,
  };
}

/** Deck déterministe de N cartes simples, pour les tests (pas d'effet automatisé). */
export function makeDeck(count: number): Card[] {
  return Array.from({ length: count }, (_, i) => makeCard({ id: `card-${i}` }));
}
