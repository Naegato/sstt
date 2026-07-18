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
  return (
    <button
      type="button"
      disabled={disabled || !onPlay}
      onClick={() => onPlay?.(card)}
      className={["card", `card--${card.rarity}`, selected ? "card--selected" : "", dimmed ? "card--dimmed" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="card__rarity">{rarityLabel[card.rarity]}</span>
      <span className="card__name">{card.name}</span>
      <span className="card__text">{card.text}</span>
    </button>
  );
}
