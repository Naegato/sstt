import type { Card as CardType } from "@card-game/shared-types";
import { Card } from "./Card";

type PlayerHandProps = {
  hand: CardType[];
  /** Certaines cartes réactives (ex: Vie supplémentaire) restent jouables même quand le reste de la main est désactivé. */
  isCardDisabled: (card: CardType) => boolean;
  selectedCardId: string | null;
  /** Vrai quand une carte sélectionnée attend un clic sur un plateau cible (voir GameBoard). */
  isTargeting: boolean;
  onSelectCard: (card: CardType) => void;
};

export function PlayerHand({ hand, isCardDisabled, selectedCardId, isTargeting, onSelectCard }: PlayerHandProps) {
  return (
    <div className="player-hand">
      <h2>Ma main</h2>

      <div className="player-hand__cards">
        {hand.map((card) => (
          <Card
            key={card.id}
            card={card}
            disabled={isCardDisabled(card)}
            selected={card.id === selectedCardId}
            dimmed={isTargeting && card.id !== selectedCardId}
            onPlay={onSelectCard}
          />
        ))}
      </div>
    </div>
  );
}
