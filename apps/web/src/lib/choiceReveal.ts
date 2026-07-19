import type { GameState } from "@card-game/shared-types";
import type { AnySideEffect } from "./playAnnouncements";

export type ChoiceReveal = {
  title: string;
  entries: { name: string; label: string }[];
};

/**
 * Valeurs brutes du moteur (VOTES_REVEALED/CHOICES_REVEALED) → libellé lisible.
 * Reste volontairement générique (pas de dépendance au mode du vote/choix, qui
 * n'est pas porté par ces side effects) — couvre toutes les valeurs connues du
 * moteur, un passthrough sinon (ex: "3" pour Chiffre).
 */
const VALUE_LABELS: Record<string, string> = {
  oui: "Oui",
  non: "Non",
  pierre: "🪨 Pierre",
  feuille: "📄 Feuille",
  ciseaux: "✂️ Ciseaux",
};

function labelFor(value: string): string {
  return VALUE_LABELS[value] ?? value;
}

type RevealSideEffect =
  | { type: "VOTES_REVEALED"; votes: Record<string, string> }
  | { type: "CHOICES_REVEALED"; choices: Record<string, string> };

/**
 * Révèle qui a voté/choisi quoi — seulement une fois la résolution actée côté
 * moteur (donc jamais pendant que le vote/choix est encore en cours, suspense
 * préservé — voir VotePanel/ChoicePanel qui n'affichent que "qui a déjà agi"
 * pendant ce temps). Demande explicite de l'utilisateur.
 */
export function extractChoiceReveal(
  state: GameState,
  sideEffects: AnySideEffect[] | undefined,
): ChoiceReveal | null {
  if (!sideEffects) return null;
  for (const raw of sideEffects) {
    if (raw.type !== "VOTES_REVEALED" && raw.type !== "CHOICES_REVEALED") continue;
    const effect = raw as unknown as RevealSideEffect;
    const map = effect.type === "VOTES_REVEALED" ? effect.votes : effect.choices;
    const entries = Object.entries(map).map(([playerId, value]) => ({
      name: state.players.find((p) => p.id === playerId)?.name ?? playerId,
      label: labelFor(value),
    }));
    return { title: effect.type === "VOTES_REVEALED" ? "Résultat du vote" : "Résultat du choix", entries };
  }
  return null;
}
