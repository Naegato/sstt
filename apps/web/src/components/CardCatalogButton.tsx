"use client";

import { useState } from "react";
import { CardCatalogModal } from "./CardCatalogModal";

/** Bouton + modale auto-portés, à poser tel quel dans le lobby et en jeu (GameBoard). */
export function CardCatalogButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-sticker btn-sticker--zone" onClick={() => setOpen(true)}>
        📖 Toutes les cartes
      </button>
      <CardCatalogModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
