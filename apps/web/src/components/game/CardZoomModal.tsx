"use client";

import { useEffect } from "react";
import type { Card as CardType } from "@card-game/shared-types";

type CardZoomModalProps = {
  card: CardType | null;
  onClose: () => void;
  /**
   * Réservé à l'aperçu d'une carte EN MAIN (voir GameBoard.previewCard) : si
   * fourni, affiche un bouton "Jouer cette carte" à la place de la simple
   * croix de fermeture — clic sur une carte posée (peek) reste read-only.
   */
  onConfirm?: () => void;
  confirmLabel?: string;
};

const rarityLabel: Record<CardType["rarity"], string> = {
  normale: "Normale",
  etoile: "Étoile",
  chaos: "Chaos",
  vierge: "Vierge",
};

/**
 * Affiche une carte en grand au centre de l'écran, pour être sûr de bien la
 * lire avant d'agir — soit en lecture seule (carte déjà posée, sienne ou en
 * peek chez un adversaire), soit avec confirmation (carte en main : on doit
 * valider "Jouer cette carte" avant qu'elle parte réellement en jeu).
 */
export function CardZoomModal({ card, onClose, onConfirm, confirmLabel = "Jouer cette carte" }: CardZoomModalProps) {
  useEffect(() => {
    if (!card) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [card, onClose]);

  if (!card) return null;

  return (
    <div className="zoom-modal is-open" onClick={onClose}>
      <div
        className={`zoom-modal__card zoom-modal__card--${card.rarity}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="zoom-modal-name"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="zoom-modal__close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        <span className="zoom-modal__rarity">{rarityLabel[card.rarity]}</span>
        <span className="zoom-modal__name" id="zoom-modal-name">
          {card.name}
        </span>
        <span className="zoom-modal__text">{card.text}</span>

        {onConfirm && (
          <div className="zoom-modal__actions">
            <button type="button" className="btn-sticker" onClick={onConfirm}>
              {confirmLabel}
            </button>
            <button type="button" className="btn-sticker btn-sticker--zone" onClick={onClose}>
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
