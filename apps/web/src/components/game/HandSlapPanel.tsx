"use client";

import type { Card as CardType, PendingHandSlap, PlayerId } from "@card-game/shared-types";

type HandSlapPanelProps = {
  pendingHandSlap: PendingHandSlap;
  card: CardType | undefined;
  selfPlayerId: PlayerId | null;
  onSlap: () => void;
};

const MODE_LABELS: Record<PendingHandSlap["mode"], string> = {
  firstLoses: "Le premier qui pose sa main est éliminé.",
  lastLoses: "Le dernier qui pose sa main est éliminé.",
  onlyFirstSurvives: "Tout le monde est éliminé, sauf le premier qui pose sa main.",
};

/**
 * Course au clic ("Du chocolat !") : remplace le "tout le monde pose sa main
 * sur la carte" physique par un bouton — le serveur horodate l'ordre
 * d'arrivée (même principe de confiance "jeu entre amis" que le décompte Nez
 * à nez/Pied de nez). Ne révèle jamais QUI est arrivé en premier/dernier
 * avant la résolution (juste un compteur), pour garder un peu de suspense —
 * la résolution finale est calculée côté serveur par `slapHand()`.
 */
export function HandSlapPanel({ pendingHandSlap, card, selfPlayerId, onSlap }: HandSlapPanelProps) {
  const hasSlapped = Boolean(selfPlayerId && pendingHandSlap.order.includes(selfPlayerId));
  const isSelfEligible = Boolean(selfPlayerId && pendingHandSlap.eligiblePlayerIds.includes(selfPlayerId));
  const slappedCount = pendingHandSlap.order.length;

  return (
    <>
      {card && (
        <div className="nose-countdown__card-pin">
          <span className="card__rarity">Carte en cours</span>
          <span className="card__name">{card.name}</span>
          <span className="card__text">{card.text}</span>
        </div>
      )}

      <div className="vote-panel hand-slap">
        <h2>{card?.name ?? "Du chocolat !"}</h2>
        <p>{MODE_LABELS[pendingHandSlap.mode]}</p>
        <p>
          {slappedCount} / {pendingHandSlap.eligiblePlayerIds.length} ont posé leur main.
        </p>

        {isSelfEligible &&
          (hasSlapped ? (
            <p>Main posée ! En attente des autres...</p>
          ) : (
            <button type="button" className="btn-sticker hand-slap__btn" onClick={onSlap}>
              🍫 Poser sa main !
            </button>
          ))}
      </div>
    </>
  );
}
