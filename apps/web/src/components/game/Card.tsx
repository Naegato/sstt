import type { Card as CardType } from "@card-game/shared-types";

type CardProps = {
  card: CardType;
  disabled?: boolean;
  /** Carte actuellement sélectionnée pour être jouée (attend un clic sur une cible). */
  selected?: boolean;
  /** Une autre carte est sélectionnée : celle-ci s'estompe pour ne pas distraire. */
  dimmed?: boolean;
  onPlay?: (card: CardType) => void;
};

const rarityLabel: Record<CardType["rarity"], string> = {
  normale: "Normale",
  etoile: "Étoile",
  chaos: "Chaos",
  vierge: "Vierge",
};

export function Card({ card, disabled, selected, dimmed, onPlay }: CardProps) {
  // `disabled` reste purement visuel (voir .card:disabled dans globals.css) : le
  // bouton n'est jamais nativement désactivé, sinon impossible de zoomer/lire
  // une carte de sa main quand ce n'est pas son tour — onPlay est appelé dans
  // tous les cas, à charge de l'appelant (voir GameBoard.handleCardClick) de
  // proposer un aperçu en lecture seule plutôt qu'une confirmation de jeu.
  return (
    <button
      type="button"
      disabled={!onPlay}
      aria-disabled={disabled}
      onClick={() => onPlay?.(card)}
      className={[
        "card",
        `card--${card.rarity}`,
        disabled ? "card--unplayable" : "",
        selected ? "card--selected" : "",
        dimmed ? "card--dimmed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="card__rarity">{rarityLabel[card.rarity]}</span>
      <span className="card__name">{card.name}</span>
      <span className="card__text">{card.text}</span>
    </button>
  );
}
