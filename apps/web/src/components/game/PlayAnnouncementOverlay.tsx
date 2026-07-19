"use client";

import type { PlayAnnouncement } from "@/lib/playAnnouncements";

type PlayAnnouncementOverlayProps = {
  announcement: PlayAnnouncement | null;
};

const rarityLabel: Record<PlayAnnouncement["card"]["rarity"], string> = {
  normale: "Normale",
  etoile: "Étoile",
  chaos: "Chaos",
  vierge: "Vierge",
};

/**
 * Annonce plein écran d'une carte qui vient d'être jouée par n'importe quel
 * joueur — voir `useSocket` (le nouvel état du jeu n'est appliqué qu'APRÈS
 * ce délai, pour laisser le temps de lire avant que l'effet ne devienne
 * visible). Face visible : nom + texte complet. Face cachée (Bataille,
 * Chiffre, Du chocolat ! — voir `isFaceDownCard`) : uniquement le dos de la
 * carte, jamais le nom ni le texte, même principe de secret que le reste du jeu.
 */
export function PlayAnnouncementOverlay({ announcement }: PlayAnnouncementOverlayProps) {
  if (!announcement) return null;
  const { card, holderName, faceDown } = announcement;

  return (
    <div className="play-announcement" aria-live="polite">
      <p className="play-announcement__holder">{holderName} a joué :</p>
      {faceDown ? (
        <div className="play-announcement__card play-announcement__card--back">
          <span className="play-announcement__back-label">Carte face cachée</span>
        </div>
      ) : (
        <div className={`play-announcement__card card--${card.rarity}`}>
          <span className="card__rarity">{rarityLabel[card.rarity]}</span>
          <span className="card__name">{card.name}</span>
          <span className="card__text">{card.text}</span>
        </div>
      )}
    </div>
  );
}
