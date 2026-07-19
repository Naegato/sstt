"use client";

import type { ChoiceReveal } from "@/lib/choiceReveal";

type ChoiceRevealOverlayProps = {
  reveal: ChoiceReveal | null;
};

/**
 * Révèle qui a voté/choisi quoi, une fois la résolution actée (voir
 * `useSocket` — le nouvel état n'est appliqué qu'APRÈS ce délai, même
 * principe que `PlayAnnouncementOverlay`). Jamais affiché pendant que le
 * vote/choix est encore en cours — voir VotePanel/ChoicePanel.
 */
export function ChoiceRevealOverlay({ reveal }: ChoiceRevealOverlayProps) {
  if (!reveal) return null;

  return (
    <div className="play-announcement" aria-live="polite">
      <p className="play-announcement__holder">{reveal.title}</p>
      <div className="choice-reveal__list">
        {reveal.entries.map((entry, i) => (
          <div key={`${entry.name}-${i}`} className="choice-reveal__entry">
            <span className="choice-reveal__name">{entry.name}</span>
            <span className="choice-reveal__value">{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
