import type { Card as CardType } from "@card-game/shared-types";

type PlayedCardsPileProps = {
  cards: CardType[];
  /** Vrai si le joueur courant peut voler une carte de cette pile ("Pingouins", début de son tour). */
  stealable?: boolean;
  onSteal?: (cardId: string) => void;
  /** Affiche la carte en grand (voir GameBoard : modal de zoom partagée). */
  onZoom?: (card: CardType) => void;
};

export function PlayedCardsPile({ cards, stealable, onSteal, onZoom }: PlayedCardsPileProps) {
  if (cards.length === 0) {
    return <p className="played-cards played-cards--empty">Aucune carte posée.</p>;
  }

  return (
    <ul className="played-cards">
      {cards.map((card, index) => (
        <li key={`${card.id}-${index}`} className={`played-cards__item played-cards__item--${card.rarity}`}>
          <button
            type="button"
            className="played-cards__zoom-trigger"
            onClick={() => onZoom?.(card)}
            title="Voir la carte en grand"
          >
            {card.name}
          </button>
          {stealable && (
            <button type="button" onClick={() => onSteal?.(card.id)}>
              Voler
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
