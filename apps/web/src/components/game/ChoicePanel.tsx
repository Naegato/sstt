import type { PendingChoice, PlayerId } from "@card-game/shared-types";

type ChoicePanelProps = {
  pendingChoice: PendingChoice;
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

export function ChoicePanel({ pendingChoice, selfPlayerId, onChoose }: ChoicePanelProps) {
  const hasChosen = selfPlayerId ? pendingChoice.choices[selfPlayerId] !== undefined : false;
  const chosenCount = Object.keys(pendingChoice.choices).length;
  const { title, options } = CHOICE_OPTIONS[pendingChoice.mode];

  return (
    <div className="vote-panel">
      <h2>{title}</h2>
      {pendingChoice.mode === "rockPaperScissors" && (
        <p>Choisissez en secret : les joueurs qui choisissent « Feuille » sont éliminés.</p>
      )}
      {pendingChoice.mode === "fingerCount" && (
        <p>Montrez en secret un nombre de doigts (1 à 5) : si la somme totale est un nombre premier, ça gagne.</p>
      )}
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
