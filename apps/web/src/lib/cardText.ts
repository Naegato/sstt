import type { Card as CardType } from "@card-game/shared-types";

const HIDDEN_SENTENCE_MARKER = "SANS lire la dernière phrase";

/**
 * Certaines cartes (Bataille, Chiffre, Du chocolat !) portent l'instruction
 * "Lisez la phrase suivante à voix haute, puis posez cette carte face cachée
 * sur la table SANS lire la dernière phrase : « ... »" — la phrase entre
 * guillemets est ce que les joueurs sont censés voir/entendre ; tout ce qui
 * suit (la règle de résolution : qui gagne/perd) doit rester caché jusqu'à la
 * résolution, sinon ça casse tout le suspense de la carte. Retourne le texte
 * complet tel quel pour les cartes qui n'ont pas ce marqueur (rien à cacher).
 */
export function getPublicCardPrompt(card: CardType | undefined): string {
  if (!card) return "";
  const markerIndex = card.text.indexOf(HIDDEN_SENTENCE_MARKER);
  if (markerIndex === -1) return card.text;

  const afterMarker = card.text.slice(markerIndex + HIDDEN_SENTENCE_MARKER.length);
  const quoteStart = afterMarker.indexOf("«");
  const quoteEnd = afterMarker.indexOf("»");
  if (quoteStart === -1 || quoteEnd === -1 || quoteEnd < quoteStart) {
    return card.text.slice(0, markerIndex).trim();
  }
  return afterMarker.slice(quoteStart + 1, quoteEnd).trim();
}
