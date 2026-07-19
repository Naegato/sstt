"use client";

import type { Card as CardType, PendingHandSlap, PlayerId } from "@card-game/shared-types";
import { getPublicCardPrompt } from "@/lib/cardText";

type HandSlapPanelProps = {
  pendingHandSlap: PendingHandSlap;
  card: CardType | undefined;
  selfPlayerId: PlayerId | null;
  onSlap: () => void;
};

/**
 * Course au clic ("Du chocolat !") : remplace le "tout le monde pose sa main
 * sur la carte" physique par un bouton — le serveur horodate l'ordre
 * d'arrivée (même principe de confiance "jeu entre amis" que le décompte Nez
 * à nez/Pied de nez). Ne révèle jamais QUI est arrivé en premier/dernier
 * avant la résolution (juste un compteur), ni QUELLE règle départage (premier/
 * dernier/tous sauf le premier) — c'est justement la "dernière phrase" que la
 * carte physique demande de ne pas lire à voix haute, sinon la course perd
 * tout son intérêt. La résolution finale est calculée côté serveur par `slapHand()`.
 */
export function HandSlapPanel({ pendingHandSlap, card, selfPlayerId, onSlap }: HandSlapPanelProps) {
  const hasSlapped = Boolean(selfPlayerId && pendingHandSlap.order.includes(selfPlayerId));
  const isSelfEligible = Boolean(selfPlayerId && pendingHandSlap.eligiblePlayerIds.includes(selfPlayerId));
  const slappedCount = pendingHandSlap.order.length;
  const publicPrompt = getPublicCardPrompt(card);

  return (
    <>
      {card && (
        <div className="nose-countdown__card-pin">
          <span className="nose-countdown__card-pin-warning">⚠️ Attention, cette carte est en cours !</span>
          <span className="card__name">{card.name}</span>
          {publicPrompt && <span className="card__text">« {publicPrompt} »</span>}
        </div>
      )}

      <div className="vote-panel hand-slap">
        <h2>{card?.name ?? "Du chocolat !"}</h2>
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
