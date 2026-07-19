"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Card as CardType } from "@card-game/shared-types";

type DiscardPileModalProps = {
  open: boolean;
  cards: CardType[];
  onClose: () => void;
};

const rarityLabel: Record<CardType["rarity"], string> = {
  normale: "Normale",
  etoile: "Étoile",
  chaos: "Chaos",
  vierge: "Vierge",
};

/**
 * Consultation de la défausse commune (`GameState.discardPile`) — jusqu'ici
 * seul le nom de la dernière carte défaussée était visible sur la table.
 * Même patron que `CardCatalogModal` (portail + zoom imbriqué), mais sur les
 * vraies cartes de la partie en cours plutôt que le catalogue statique.
 */
export function DiscardPileModal({ open, cards, onClose }: DiscardPileModalProps) {
  const [zoomed, setZoomed] = useState<CardType | null>(null);

  useEffect(() => {
    if (!open) setZoomed(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoomed) setZoomed(null);
      else onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, zoomed]);

  if (!open) return null;

  return createPortal(
    <div className="zoom-modal is-open catalog-modal" onClick={onClose}>
      <div
        className="catalog-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="zoom-modal__close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        <h2 id="discard-modal-title">Défausse</h2>
        <p className="catalog-modal__count">
          {cards.length} carte{cards.length > 1 ? "s" : ""}
        </p>
        {cards.length === 0 ? (
          <p>La défausse est vide.</p>
        ) : (
          <div className="catalog-grid">
            {[...cards].reverse().map((c, i) => (
              <button
                key={`${c.id}-${i}`}
                type="button"
                className={`card catalog-card card--${c.rarity}`}
                onClick={() => setZoomed(c)}
              >
                <span className="card__rarity">{rarityLabel[c.rarity]}</span>
                <span className="card__name">{c.name}</span>
                <span className="card__text">{c.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {zoomed && (
        <div
          className="zoom-modal is-open"
          onClick={(e) => {
            e.stopPropagation();
            setZoomed(null);
          }}
        >
          <div
            className={`zoom-modal__card zoom-modal__card--${zoomed.rarity}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-zoom-name"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="zoom-modal__close" onClick={() => setZoomed(null)} aria-label="Fermer">
              ✕
            </button>
            <span className="zoom-modal__rarity">{rarityLabel[zoomed.rarity]}</span>
            <span className="zoom-modal__name" id="discard-zoom-name">
              {zoomed.name}
            </span>
            <span className="zoom-modal__text">{zoomed.text}</span>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
