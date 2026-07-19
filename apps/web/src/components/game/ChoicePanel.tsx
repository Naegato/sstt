import type { Card as CardType, PendingChoice, PlayerId } from "@card-game/shared-types";
import { getPublicCardPrompt } from "@/lib/cardText";

type ChoicePanelProps = {
  pendingChoice: PendingChoice;
  card: CardType | undefined;
  selfPlayerId: PlayerId | null;
  onChoose: (value: string) => void;
};

/**
 * Choix simultané à options multiples (Bataille, Chiffre) — pendant de
 * VotePanel mais pour un choix qui n'est pas juste oui/non. N'affiche jamais
 * le choix des autres avant résolution, seulement qui a déjà choisi.
 */
const CHOICE_OPTIONS: Record<PendingChoice["mode"], { title: string; options: { value: string; label: string }[] }> =
  {
    rockPaperScissors: {
      title: "Bataille !",
      options: [
        { value: "pierre", label: "🪨 Pierre" },
        { value: "feuille", label: "📄 Feuille" },
        { value: "ciseaux", label: "✂️ Ciseaux" },
      ],
    },
    fingerCount: {
      title: "Chiffre !",
      options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })),
    },
  };

export function ChoicePanel({ pendingChoice, card, selfPlayerId, onChoose }: ChoicePanelProps) {
  const hasChosen = selfPlayerId ? pendingChoice.choices[selfPlayerId] !== undefined : false;
  const chosenCount = Object.keys(pendingChoice.choices).length;
  const { title, options } = CHOICE_OPTIONS[pendingChoice.mode];
  // La règle de résolution (qui gagne/perd) est la "dernière phrase" que la
  // carte demande explicitement de ne pas lire à voix haute — seul le prompt
  // public (entre guillemets sur la carte) doit apparaître ici, jamais la règle.
  const publicPrompt = getPublicCardPrompt(card);

  return (
    <div className="vote-panel">
      <h2>{title}</h2>
      {publicPrompt && <p>« {publicPrompt} »</p>}
      <p>
        {chosenCount} / {pendingChoice.eligiblePlayerIds.length} joueurs ont choisi.
      </p>
      {hasChosen ? (
        <p>Ton choix est enregistré, en attente des autres joueurs...</p>
      ) : (
        <div className="vote-panel__actions">
          {options.map((option) => (
            <button key={option.value} type="button" className="btn-sticker" onClick={() => onChoose(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
