import type { PendingVote, Player, PlayerId } from "@card-game/shared-types";

type VotePanelProps = {
  pendingVote: PendingVote;
  selfPlayerId: PlayerId | null;
  players: Player[];
  onVote: (choice: "oui" | "non") => void;
};

/**
 * N'affiche jamais le choix des autres joueurs avant résolution — seulement
 * qui a déjà voté. Le "secret" du vote est une convention côté UI, pas un
 * secret cryptographique côté serveur (amplement suffisant entre amis).
 */
const VOTE_LABELS: Record<PendingVote["mode"], { title: string; oui: string; non: string }> = {
  simultaneous: { title: "Cadeaux 🎁", oui: "Oui", non: "Non" },
  cakeOrGrave: { title: "Gâteau ou Tombeau", oui: "Tombeau", non: "Gâteau" },
  deathOrTchi: { title: "La mort ou Tchi-tchi ?", oui: "Tchi-tchi", non: "La mort" },
  denunciation: { title: "Dénonciation", oui: "Coupable", non: "Pas coupable" },
  winClaim: { title: "Vous avez gagné !", oui: "Vrai", non: "Faux" },
};

export function VotePanel({ pendingVote, selfPlayerId, players, onVote }: VotePanelProps) {
  const hasVoted = selfPlayerId ? pendingVote.votes[selfPlayerId] !== undefined : false;
  const votedCount = Object.keys(pendingVote.votes).length;
  const labels = VOTE_LABELS[pendingVote.mode];
  const nameOf = (id: PlayerId) => players.find((p) => p.id === id)?.name ?? id;

  const actorPlayerId =
    pendingVote.mode === "cakeOrGrave" || pendingVote.mode === "winClaim" ? pendingVote.actorPlayerId : null;
  if (actorPlayerId && selfPlayerId === actorPlayerId) {
    return (
      <div className="vote-panel">
        <h2>Vote en cours : {labels.title}</h2>
        <p>
          Tu as joué cette carte, tu ne votes pas. En attente des autres joueurs ({votedCount} /{" "}
          {pendingVote.eligiblePlayerIds.length}) ...
        </p>
      </div>
    );
  }

  return (
    <div className="vote-panel">
      <h2>Vote en cours : {labels.title}</h2>
      {pendingVote.mode === "denunciation" && (
        <p>
          {pendingVote.accuserId === pendingVote.accusedId
            ? `${nameOf(pendingVote.accuserId)} se dénonce soi-même`
            : `${nameOf(pendingVote.accuserId)} dénonce ${nameOf(pendingVote.accusedId)}`}{" "}
          : « {pendingVote.reason} »
          {selfPlayerId === pendingVote.accusedId && " — tout le monde vote, y compris toi."}
        </p>
      )}
      {pendingVote.mode === "winClaim" && (
        <p>
          {nameOf(pendingVote.actorPlayerId)} prétend que : « {pendingVote.description} »
        </p>
      )}
      <p>
        {votedCount} / {pendingVote.eligiblePlayerIds.length} joueurs ont voté.
      </p>
      {hasVoted ? (
        <p>Ton vote est enregistré, en attente des autres joueurs...</p>
      ) : (
        <div className="vote-panel__actions">
          <button type="button" className="btn-sticker" onClick={() => onVote("oui")}>
            {labels.oui}
          </button>
          <button type="button" className="btn-sticker btn-sticker--zone" onClick={() => onVote("non")}>
            {labels.non}
          </button>
        </div>
      )}
    </div>
  );
}
