"use client";

import { useEffect, useState } from "react";
import type { Card as CardType, PendingNoseCountdown, Player, PlayerId } from "@card-game/shared-types";

type NoseCountdownPanelProps = {
  pendingNoseCountdown: PendingNoseCountdown;
  card: CardType | undefined;
  players: Player[];
  selfPlayerId: PlayerId | null;
  onToggle: (touching: boolean) => void;
};

/**
 * Décompte synchronisé (Nez à nez, Pied de nez) : remplace le "comptez à voix
 * haute" par un gros chiffre animé identique pour tout le monde (calculé
 * localement depuis `pendingNoseCountdown.seconds`, pas un vrai minuteur
 * réseau — cohérent avec le principe "jeu entre amis" déjà appliqué au
 * secret des votes). La carte reste épinglée en haut à gauche pour relire
 * rapidement la règle (garder ou lâcher son doigt). La résolution finale
 * (qui est éliminé) est calculée côté serveur par `resolveNoseCountdown()`,
 * pas ici — ce panneau n'est qu'une aide visuelle + le bouton "nez" en direct.
 */
export function NoseCountdownPanel({ pendingNoseCountdown, card, players, selfPlayerId, onToggle }: NoseCountdownPanelProps) {
  const [secondsLeft, setSecondsLeft] = useState(pendingNoseCountdown.seconds);

  useEffect(() => {
    setSecondsLeft(pendingNoseCountdown.seconds);
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [pendingNoseCountdown.cardId, pendingNoseCountdown.seconds]);

  const selfTouching = selfPlayerId ? (pendingNoseCountdown.touching[selfPlayerId] ?? false) : false;
  const isSelfEligible = Boolean(selfPlayerId && pendingNoseCountdown.eligiblePlayerIds.includes(selfPlayerId));

  return (
    <>
      {card && (
        <div className="nose-countdown__card-pin">
          <span className="nose-countdown__card-pin-warning">⚠️ Attention, cette carte est en cours !</span>
          <span className="card__name">{card.name}</span>
          <span className="card__text">{card.text}</span>
        </div>
      )}

      <div className="vote-panel nose-countdown">
        <h2>{card?.name ?? "Décompte"}</h2>
        <div className="nose-countdown__timer">{secondsLeft}</div>

        {isSelfEligible && (
          <button
            type="button"
            className={`nose-countdown__nose-btn${selfTouching ? " nose-countdown__nose-btn--active" : ""}`}
            onClick={() => onToggle(!selfTouching)}
          >
            👃 {selfTouching ? "Je touche mon nez" : "Toucher mon nez"}
          </button>
        )}

        <div className="nose-countdown__players">
          {pendingNoseCountdown.eligiblePlayerIds.map((id) => {
            const player = players.find((p) => p.id === id);
            const touching = pendingNoseCountdown.touching[id] ?? false;
            return (
              <span key={id} className={`nose-countdown__player${touching ? " nose-countdown__player--touching" : ""}`}>
                👃 {player?.name ?? id}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}
