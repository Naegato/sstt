"use client";

import { useState } from "react";
import type { Player, PlayerId } from "@card-game/shared-types";
import { PlayedCardsPile } from "./PlayedCardsPile";

type TurnIndicatorProps = {
  players: Player[];
  currentPlayerId: PlayerId | null;
  selfPlayerId: PlayerId | null;
  /** Score à atteindre pour gagner par points (GameState.pointsToWin, modifiable par "Super Points") — affiché à côté du score de chacun. */
  pointsToWin: number;
  /** Joueurs dont on peut voler une carte en ce moment (voir "Pingouins" dans GameBoard). */
  stealableFromPlayerIds?: PlayerId[];
  onSteal?: (targetPlayerId: PlayerId, cardId: string) => void;
  /** Zoom en grand sur une carte posée (voir GameBoard, modal partagée avec ses propres cartes). */
  onZoomCard?: (card: Player["playedCards"][number]) => void;
  /** Joueurs où poser la carte actuellement sélectionnée (zones illuminées, voir GameBoard). */
  targetablePlayerIds?: PlayerId[];
  onSelectTarget?: (targetPlayerId: PlayerId) => void;
};

const MAX_CHIPS = 4;

export function TurnIndicator({
  players,
  currentPlayerId,
  selfPlayerId,
  pointsToWin,
  stealableFromPlayerIds = [],
  onSteal,
  onZoomCard,
  targetablePlayerIds = [],
  onSelectTarget,
}: TurnIndicatorProps) {
  // Plateau replié par défaut : on ne voit les cartes posées d'un joueur en
  // détail qu'en cliquant sur sa tuile ("peek"), comme le plateau d'un
  // adversaire dans un jeu de cartes physique — pas tout affiché en permanence.
  const [expandedPlayerId, setExpandedPlayerId] = useState<PlayerId | null>(null);

  return (
    <div className="players-board">
      {players.map((player) => {
        const isCurrent = player.id === currentPlayerId;
        const isSelf = player.id === selfPlayerId;
        const isExpanded = expandedPlayerId === player.id;
        const overflowCount = Math.max(0, player.playedCards.length - MAX_CHIPS);
        const isTargetable = targetablePlayerIds.includes(player.id);
        const isStealTarget = stealableFromPlayerIds.includes(player.id);

        // En mode ciblage, cliquer une zone illuminée pose la carte sélectionnée
        // au lieu de simplement déplier/replier le peek.
        const handleClick = () => {
          if (isTargetable) {
            onSelectTarget?.(player.id);
            return;
          }
          setExpandedPlayerId(isExpanded ? null : player.id);
        };

        return (
          <div
            key={player.id}
            className={[
              "player-card",
              isCurrent ? "player-card--current" : "",
              player.isEliminated ? "player-card--eliminated" : "",
              isExpanded ? "player-card--expanded" : "",
              isTargetable ? "player-card--targetable" : "",
              isStealTarget ? "player-card--stealable" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }}
          >
            {player.isEliminated && <span className="player-card__skull">💀</span>}

            <div className="player-card__head">
              <span className="player-card__avatar">{player.name.charAt(0).toUpperCase()}</span>
              <div>
                <h3>
                  {player.name}
                  {isSelf ? " (moi)" : ""}
                </h3>
                <p className="player-card__meta">
                  {player.isEliminated ? "Éliminé" : `${player.points} / ${pointsToWin} pt`}
                  {isCurrent && !player.isEliminated ? " · à son tour" : ""}
                </p>
              </div>
            </div>

            <div className="player-card__hand-stack" aria-hidden="true">
              {Array.from({ length: Math.min(player.hand.length, 6) }).map((_, i) => (
                <span key={i} className="mini-card-back" />
              ))}
            </div>
            <p className="player-card__hand-count">Cartes en main : {player.hand.length}</p>

            {!isExpanded &&
              (player.playedCards.length === 0 ? (
                <p className="played-cards played-cards--empty">Aucune carte posée.</p>
              ) : (
                <div className="player-card__chips">
                  {player.playedCards.slice(0, MAX_CHIPS).map((card, index) => (
                    <span key={`${card.id}-${index}`} className={`chip chip--${card.rarity}`}>
                      {card.name}
                    </span>
                  ))}
                  {overflowCount > 0 && <span className="chip">+{overflowCount}</span>}
                </div>
              ))}

            {isExpanded && (
              <div className="player-card__peek" onClick={(e) => e.stopPropagation()}>
                <PlayedCardsPile
                  cards={player.playedCards}
                  stealable={stealableFromPlayerIds.includes(player.id)}
                  onSteal={(cardId) => onSteal?.(player.id, cardId)}
                  onZoom={onZoomCard}
                />
              </div>
            )}

            <span className="player-card__hint">{isExpanded ? "cliquer pour refermer" : "cliquer pour voir"}</span>
          </div>
        );
      })}
    </div>
  );
}
