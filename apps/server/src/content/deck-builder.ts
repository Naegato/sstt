import type { Card } from "@card-game/shared-types";

/** Mélange générique injectable (Fisher-Yates) — réutilisé par le mélange initial du deck et par tout effet de carte nécessitant de l'aléatoire côté service (ex: Politique). */
export function shuffleWith<T>(items: T[], random: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Mélange le deck en garantissant une distribution équilibrée des cartes Étoile
 * (règle officielle : chances à peu près égales pour chaque joueur d'en piocher
 * une au cours de la partie). Un mélange purement aléatoire ne le garantit pas —
 * les cartes Étoile pourraient toutes se regrouper au début ou à la fin du deck.
 *
 * Technique : le deck final est découpé en autant de segments disjoints qu'il y
 * a de cartes Étoile (positions calculées sur la longueur finale, pas en
 * insérant progressivement dans un tableau qui grandit — sinon les positions
 * dérivent au fil des insertions). Chaque carte Étoile est placée à une position
 * aléatoire à l'intérieur de "son" segment.
 *
 * `random` est injectable pour des tests déterministes — le moteur pur, lui, ne
 * mélange jamais rien (voir GameStartedEvent.deck) ; cette fonction s'exécute
 * côté service, avant de construire l'event.
 */
export function buildBalancedDeck(cards: Card[], random: () => number = Math.random): Card[] {
  const normale = shuffleWith(
    cards.filter((c) => c.rarity !== "etoile"),
    random,
  );
  const etoile = shuffleWith(
    cards.filter((c) => c.rarity === "etoile"),
    random,
  );

  if (etoile.length === 0) {
    return normale;
  }

  const total = normale.length + etoile.length;
  const segmentSize = total / etoile.length;

  const deck: (Card | undefined)[] = new Array(total);
  etoile.forEach((starCard, i) => {
    const segmentStart = Math.floor(i * segmentSize);
    const segmentEnd = i === etoile.length - 1 ? total : Math.floor((i + 1) * segmentSize);
    const pos = segmentStart + Math.floor(random() * Math.max(1, segmentEnd - segmentStart));
    deck[Math.min(pos, total - 1)] = starCard;
  });

  let normaleIndex = 0;
  for (let i = 0; i < total; i++) {
    if (!deck[i]) {
      deck[i] = normale[normaleIndex++];
    }
  }

  return deck as Card[];
}
