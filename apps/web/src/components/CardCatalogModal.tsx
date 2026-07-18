"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CardCatalogEntry } from "@card-game/shared-types";
import { getCardCatalog } from "@/lib/api";

type CardCatalogModalProps = {
  open: boolean;
  onClose: () => void;
};

const rarityLabel: Record<CardCatalogEntry["rarity"], string> = {
  normale: "Normale",
  etoile: "Étoile",
  chaos: "Chaos",
  vierge: "Vierge",
};

/**
 * Modale de consultation de toutes les cartes du deck jouable (normale + étoile),
 * récupérées via `GET /api/cards` — pas d'exemplaire par exemplaire (regroupées
 * par nom+texte, avec un badge `×N`), juste pour parcourir/chercher une carte.
 * N'affiche que les cartes déjà dans le moteur, jamais un texte inventé pour
 * les cartes pas encore ajoutées (voir CLAUDE.md §4).
 */
export function CardCatalogModal({ open, onClose }: CardCatalogModalProps) {
  const [cards, setCards] = useState<CardCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [zoomed, setZoomed] = useState<CardCatalogEntry | null>(null);

  useEffect(() => {
    if (!open || cards || error) return;
    getCardCatalog()
      .then(setCards)
      .catch(() => setError("Impossible de charger le catalogue des cartes."));
  }, [open, cards, error]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Referme d'abord le zoom s'il est ouvert, la modale seulement au appui suivant.
      if (zoomed) setZoomed(null);
      else onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, zoomed]);

  useEffect(() => {
    if (!open) setZoomed(null);
  }, [open]);

  if (!open) return null;

  const filtered = (cards ?? []).filter((c) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return c.name.toLowerCase().includes(needle) || c.text.toLowerCase().includes(needle);
  });

  return createPortal(
    <div className="zoom-modal is-open catalog-modal" onClick={onClose}>
      <div
        className="catalog-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="zoom-modal__close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
        <h2 id="catalog-modal-title">Toutes les cartes</h2>
        <input
          className="input-sticker catalog-modal__search"
          type="text"
          placeholder="Chercher une carte..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {error && <p className="sticker-form__error">{error}</p>}
        {!error && !cards && <p>Chargement...</p>}
        {cards && (
          <>
            <p className="catalog-modal__count">
              {filtered.length} carte{filtered.length > 1 ? "s" : ""}
            </p>
            <div className="catalog-grid">
              {filtered.map((c) => (
                <button
                  key={`${c.name}::${c.text}`}
                  type="button"
                  className={`card catalog-card card--${c.rarity}`}
                  onClick={() => setZoomed(c)}
                >
                  <span className="card__rarity">
                    {rarityLabel[c.rarity]} · {c.automated ? "auto" : "manuelle"}
                  </span>
                  <span className="card__name">{c.name}</span>
                  <span className="card__text">{c.text}</span>
                  {c.quantity > 1 && <span className="catalog-card__quantity">×{c.quantity}</span>}
                </button>
              ))}
            </div>
          </>
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
            aria-labelledby="catalog-zoom-name"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="zoom-modal__close" onClick={() => setZoomed(null)} aria-label="Fermer">
              ✕
            </button>
            <span className="zoom-modal__rarity">
              {rarityLabel[zoomed.rarity]} · {zoomed.automated ? "auto" : "manuelle"}
            </span>
            <span className="zoom-modal__name" id="catalog-zoom-name">
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
