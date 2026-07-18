"use client";

import { useEffect } from "react";
import type { Card as CardType } from "@card-game/shared-types";

type CardZoomModalProps = {
  card: CardType | null;
  onClose: () => void;
};

const rarityLabel: Record<CardType["rarity"], string> = {
  normale: "Normale",
  etoile: "Étoile",
  chaos: "Chaos",
  vierge: "Vierge",
};

/** Affiche une carte posée en grand au centre de l'écran, pour être sûr de bien la lire. */
export function CardZoomModal({ card, onClose }: CardZoomModalProps) {
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
      </div>
    </div>
  );
}
