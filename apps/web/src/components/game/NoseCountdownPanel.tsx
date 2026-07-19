"use client";

import { useEffect, useState } from "react";
import {
  type Card as CardType,
  NOSE_COUNTDOWN_TICK_MS,
  NOSE_COUNTDOWN_WARNING_MS,
  type PendingNoseCountdown,
  type Player,
  type PlayerId,
} from "@card-game/shared-types";

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
  // Deux phases, calquées sur le minuteur serveur (voir scheduleNoseCountdownResolution) :
  // "attention" (le temps de lire la carte, pas de décompte) puis un chiffre
  // toutes les NOSE_COUNTDOWN_TICK_MS jusqu'à pendingNoseCountdown.seconds.
  const [phase, setPhase] = useState<"attention" | "counting">("attention");
  const [count, setCount] = useState(0);

  useEffect(() => {
    setPhase("attention");
    setCount(0);
    const warningTimeout = setTimeout(() => setPhase("counting"), NOSE_COUNTDOWN_WARNING_MS);
    return () => clearTimeout(warningTimeout);
  }, [pendingNoseCountdown.cardId]);

  useEffect(() => {
    if (phase !== "counting") return;
    setCount(1);
    const interval = setInterval(() => {
      setCount((c) => Math.min(pendingNoseCountdown.seconds, c + 1));
    }, NOSE_COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, [phase, pendingNoseCountdown.cardId, pendingNoseCountdown.seconds]);

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
        {phase === "attention" ? (
          <p className="nose-countdown__attention">⚠️ Attention, on va jouer « {card?.name} » — lisez la carte !</p>
        ) : (
          <div className="nose-countdown__timer">{count}</div>
        )}

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
