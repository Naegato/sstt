import type { Card as CardType, GameState } from "@card-game/shared-types";

export type PlayAnnouncement = {
  card: CardType;
  holderName: string;
  /** Cartes "SANS lire la dernière phrase" (Bataille, Chiffre, Du chocolat !) : dos de carte seulement, jamais le nom/texte. */
  faceDown: boolean;
};

/**
 * `SideEffect` (moteur serveur) n'est pas exposé via `@card-game/shared-types`
 * (détail interne du moteur) — le client n'a besoin que de cette forme large,
 * typée ici en local plutôt que de coupler shared-types à un type serveur.
 */
export type AnySideEffect = { type: string; playerId?: string; cardId?: string };

type RelevantSideEffect =
  | { type: "CARD_MOVED_TO_PLAYED"; playerId: string; cardId: string }
  | { type: "CARD_DISCARDED_AFTER_PLAY"; playerId: string; cardId: string };

function isRelevant(effect: AnySideEffect): effect is RelevantSideEffect {
  return effect.type === "CARD_MOVED_TO_PLAYED" || effect.type === "CARD_DISCARDED_AFTER_PLAY";
}

/** Une carte qui doit se poser face cachée le dit explicitement dans son propre texte. */
function isFaceDownCard(card: CardType): boolean {
  return card.text.includes("face cachée");
}

/**
 * Reconstruit, dans l'ordre, la liste des cartes venant d'être jouées lors de
 * cette mise à jour d'état (normalement 1, mais "Ninjas" par exemple en pose 2
 * d'un coup : elle-même + la carte volée qu'elle force à jouer) — voir
 * `GameBoard`/`useSocket`, qui affiche chacune avant d'appliquer le nouvel état.
 */
export function extractPlayAnnouncements(state: GameState, sideEffects: AnySideEffect[] | undefined): PlayAnnouncement[] {
  if (!sideEffects) return [];

  const announcements: PlayAnnouncement[] = [];
  for (const effect of sideEffects) {
    if (!isRelevant(effect)) continue;
    const holder = state.players.find((p) => p.id === effect.playerId);
    if (!holder) continue;
    const card =
      effect.type === "CARD_MOVED_TO_PLAYED"
        ? holder.playedCards.find((c) => c.id === effect.cardId)
        : state.discardPile.find((c) => c.id === effect.cardId);
    if (!card) continue;
    announcements.push({ card, holderName: holder.name, faceDown: isFaceDownCard(card) });
  }
  return announcements;
}
