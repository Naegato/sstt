"use client";

import { useState } from "react";
import type { Card as CardType } from "@card-game/shared-types";
import { useGameStore } from "@/stores/gameStore";
import { useSocket } from "@/hooks/useSocket";
import { CardZoomModal } from "./CardZoomModal";
import { PlayerHand } from "./PlayerHand";
import { TurnIndicator } from "./TurnIndicator";
import { VotePanel } from "./VotePanel";

export function GameBoard() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = useGameStore((s) => s.playerId);
  const roomId = useGameStore((s) => s.roomId);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const {
    startGame,
    playCard,
    endTurn,
    castVote,
    stealPlayedCard,
    passHotPotato,
    denouncePlayer,
    confirmManualAction,
    resetGame,
  } = useSocket();
  const [denounceTargetId, setDenounceTargetId] = useState("");
  const [denounceReason, setDenounceReason] = useState("");
  const [confirmedCardId, setConfirmedCardId] = useState<string | null>(null);
  // Carte affichée en grand : soit en lecture seule (peek sur une carte posée,
  // pas de confirmAction), soit avec confirmation (carte en main, sur le point
  // d'être jouée — voir handleCardClick/confirmPreview).
  const [cardModal, setCardModal] = useState<{ card: CardType; confirmAction?: () => void } | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);

  if (!gameState || !roomId) {
    return <p>Connexion à la partie...</p>;
  }

  const self = gameState.players.find((p) => p.id === playerId);
  const isMyTurn = gameState.currentPlayerId === playerId;
  const otherAlivePlayers = gameState.players.filter((p) => p.id !== playerId && !p.isEliminated);

  // Cas particulier "Gros nul !" : le seul choix jouable pour un joueur venant
  // d'être éliminé en groupe est de désigner un membre de ce groupe (lui compris),
  // pas un joueur vivant — voir REACT_TO_GROUP_ELIMINATION dans apps/server/src/engine/cards.ts.
  const isReactingToGroupElimination = Boolean(
    self?.isEliminated && gameState.lastEliminationBatch?.includes(self.id),
  );
  const targetCandidates = isReactingToGroupElimination
    ? gameState.players.filter((p) => gameState.lastEliminationBatch?.includes(p.id))
    : otherAlivePlayers;

  // Les cartes réactives (ex: Vie supplémentaire, Gros nul !) restent jouables
  // même hors tour, sous condition propre à l'effet — voir apps/server/src/engine/cards.ts.
  const isCardDisabled = (card: (typeof gameState.players)[number]["hand"][number]) => {
    const isReactiveToOwnElimination = card.effects.some((e) => e.type === "REACT_TO_OWN_ELIMINATION");
    if (isReactiveToOwnElimination) return !self?.isEliminated;

    const isReactiveToGroupElimination = card.effects.some((e) => e.type === "REACT_TO_GROUP_ELIMINATION");
    if (isReactiveToGroupElimination) {
      return !self?.isEliminated || !gameState.lastEliminationBatch?.includes(self.id);
    }

    // Double usage (Embuscade de chatons) : jouable normalement à son tour (pioche 3),
    // OU à tout moment en interruption pour annuler la dernière carte jouée — voir
    // playedAsInterrupt plus bas. Désactivée seulement s'il n'y a rien à annuler.
    const canBePlayedAsInterrupt = card.effects.some((e) => e.type === "CANCEL_LAST_PLAYED_CARD");
    if (canBePlayedAsInterrupt) {
      const canPlayNormally = isMyTurn && !self?.isEliminated;
      return !canPlayNormally && !gameState.lastPlayedCard;
    }

    return !isMyTurn || Boolean(self?.isEliminated);
  };

  // Effets qui exigent réellement un joueur cible côté moteur (voir MISSING_TARGET
  // dans apps/server/src/engine/cards.ts) — détermine si sélectionner cette carte
  // ouvre le mode "zones cibles illuminées" ou la joue immédiatement.
  const TARGET_REQUIRING_EFFECTS = new Set([
    "PLACE_IN_FRONT_OF_TARGET",
    "GIVE_CARDS_TO_TARGET",
    "ELIMINATE_TARGET",
    "STEAL_RANDOM_CARD_AND_FORCE_PLAY",
    "REACT_TO_GROUP_ELIMINATION",
  ]);
  const cardNeedsTarget = (card: CardType) => card.effects.some((e) => TARGET_REQUIRING_EFFECTS.has(e.type));

  const submitPlayCard = (card: CardType, targetPlayerId?: string) => {
    if (!self) return;
    const canBePlayedAsInterrupt = card.effects.some((e) => e.type === "CANCEL_LAST_PLAYED_CARD");
    // Double usage : sur son propre tour -> mode normal (pioche 3) ; sinon
    // -> interruption (annule la dernière carte jouée) — voir isCardDisabled.
    const playedAsInterrupt = canBePlayedAsInterrupt ? !(isMyTurn && !self.isEliminated) : undefined;
    playCard(roomId, self.id, card.id, targetPlayerId, playedAsInterrupt);
    setSelectedCard(null);
  };

  // Après confirmation dans la modale d'aperçu : si la carte n'a besoin
  // d'aucune cible, jouée immédiatement ; sinon elle reste "sélectionnée" et
  // les plateaux valides s'illuminent (voir TurnIndicator) en attendant un
  // clic sur l'un d'eux.
  const confirmPreview = (card: CardType) => {
    setCardModal(null);
    if (!cardNeedsTarget(card)) {
      submitPlayCard(card);
      return;
    }
    setSelectedCard(card);
  };

  // Clic sur une carte en main : l'affiche d'abord en grand pour confirmation
  // (voir confirmPreview) — sauf reclic sur la carte déjà sélectionnée/en
  // attente de cible, qui annule directement sans repasser par l'aperçu.
  const handleCardClick = (card: CardType) => {
    if (selectedCard?.id === card.id) {
      setSelectedCard(null);
      return;
    }
    setCardModal({ card, confirmAction: () => confirmPreview(card) });
  };

  const isTargeting = Boolean(selectedCard);
  const targetablePlayerIds = isTargeting ? targetCandidates.map((p) => p.id) : [];

  // "Pingouins" : au début de son propre tour, au plus 1 vol par tour — voir
  // STEAL_ON_TURN_START / GameState.stolenThisTurn dans apps/server/src/engine.
  const canSteal =
    isMyTurn &&
    Boolean(self) &&
    !self?.isEliminated &&
    !gameState.stolenThisTurn &&
    Boolean(self?.playedCards.some((c) => c.effects.some((e) => e.type === "STEAL_ON_TURN_START")));
  const stealableFromPlayerIds = canSteal ? gameState.players.filter((p) => p.id !== playerId).map((p) => p.id) : [];

  // Confirmation d'une carte manuelle (texte affiché, pas d'automatisation) :
  // ne concerne que la toute dernière carte jouée par soi-même dans la partie
  // (GameState.lastPlayedCard), et seulement si elle est encore visible sur la
  // table (pas redirigée/annulée entre-temps) et effects vide (= manuelle).
  const lastManualCardToConfirm =
    gameState.lastPlayedCard?.holderId === self?.id
      ? self?.playedCards.find((c) => c.id === gameState.lastPlayedCard?.cardId && c.effects.length === 0)
      : undefined;
  const needsManualConfirmation = Boolean(lastManualCardToConfirm) && confirmedCardId !== lastManualCardToConfirm?.id;

  // "Patate chaude" : obligatoire avant de jouer une carte à son tour, sinon
  // élimination automatique (voir MUST_PASS_BEFORE_PLAYING dans apps/server/src/engine).
  const mustPassHotPotato =
    isMyTurn &&
    Boolean(self) &&
    !self?.isEliminated &&
    Boolean(self?.playedCards.some((c) => c.effects.some((e) => e.type === "MUST_PASS_BEFORE_PLAYING")));

  return (
    <div className="game-board">
      {errorMessage && <p className="game-board__error">{errorMessage}</p>}

      <h1>Room {roomId}</h1>

      {gameState.phase === "lobby" && (
        <div className="game-board__lobby">
          <p>{gameState.players.length} joueur(s) dans la room. En attente du lancement...</p>
          <button type="button" className="btn-sticker" onClick={() => startGame(roomId)}>
            Démarrer la partie
          </button>
        </div>
      )}

      {gameState.phase === "ended" && (
        <div className="game-board__end">
          <p className="game-board__winner">
            {gameState.winnerIds && gameState.winnerIds.length > 0
              ? `Partie terminée — ${gameState.winnerIds.length > 1 ? "vainqueurs" : "vainqueur"} : ${gameState.winnerIds
                  .map((id) => gameState.players.find((p) => p.id === id)?.name ?? id)
                  .join(", ")}`
              : "Partie terminée — aucun vainqueur."}
          </p>
          <button type="button" className="btn-sticker" onClick={() => resetGame(roomId)}>
            🔁 Rejouer une partie
          </button>
        </div>
      )}

      <div className="table">
        <div className="table__surface">
          <TurnIndicator
            players={gameState.players}
            currentPlayerId={gameState.currentPlayerId}
            selfPlayerId={playerId}
            stealableFromPlayerIds={stealableFromPlayerIds}
            onSteal={(targetPlayerId, cardId) => self && stealPlayedCard(roomId, self.id, targetPlayerId, cardId)}
            onZoomCard={(card) => setCardModal({ card })}
            targetablePlayerIds={targetablePlayerIds}
            onSelectTarget={(targetPlayerId) => selectedCard && submitPlayCard(selectedCard, targetPlayerId)}
          />

          {gameState.phase === "playing" && (
            <div className="center-strip">
              <div className="pile pile--draw">
                <div className="pile__stack">
                  <div className="layer" />
                  <div className="layer" />
                  <div className="layer" />
                </div>
                <p className="pile__label">Pioche · {gameState.drawPile.length}</p>
              </div>

              {gameState.currentPlayerId && (
                <p className="turn-banner">
                  🎲{" "}
                  {gameState.currentPlayerId === playerId
                    ? "À ton tour"
                    : `Tour de ${gameState.players.find((p) => p.id === gameState.currentPlayerId)?.name ?? "?"}`}
                </p>
              )}

              <div className="pile pile--discard">
                <div className="pile__stack">
                  <div className="layer" />
                  <div className="layer" />
                  <div className="layer">
                    {gameState.discardPile.length > 0
                      ? gameState.discardPile[gameState.discardPile.length - 1]!.name
                      : "—"}
                  </div>
                </div>
                <p className="pile__label">Défausse · {gameState.discardPile.length}</p>
              </div>
            </div>
          )}

          {self && gameState.phase === "playing" && !gameState.pendingVote && (
            <div className="self-zone">
              {isTargeting && (
                <p className="game-board__targeting-hint">
                  « {selectedCard?.name} » sélectionnée — clique un plateau illuminé pour la poser, ou reclique la
                  carte pour annuler.
                </p>
              )}

              <PlayerHand
                hand={self.hand}
                isCardDisabled={isCardDisabled}
                selectedCardId={selectedCard?.id ?? null}
                isTargeting={isTargeting}
                onSelectCard={handleCardClick}
              />
              {isMyTurn && !self.isEliminated && (
                <button type="button" className="btn-sticker" onClick={() => endTurn(roomId, self.id)}>
                  Terminer mon tour
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <CardZoomModal
        card={cardModal?.card ?? null}
        onClose={() => setCardModal(null)}
        onConfirm={cardModal?.confirmAction}
        confirmLabel="Jouer cette carte"
      />

      {gameState.phase === "playing" && gameState.pendingVote && (
        <VotePanel
          pendingVote={gameState.pendingVote}
          selfPlayerId={playerId}
          players={gameState.players}
          onVote={(choice) => self && castVote(roomId, self.id, choice)}
        />
      )}

      {/* Dénonciation : pour les cartes manuelles (texte affiché, pas d'automatisation)
          non respectées — n'importe quel joueur en jeu peut accuser un autre à tout
          moment ; ouvre un vote à majorité pour le reste de la table (voir
          ELIMINATION_CHALLENGED / startDenunciationVote côté serveur). */}
      {self && gameState.phase === "playing" && !gameState.pendingVote && !self.isEliminated && otherAlivePlayers.length > 0 && (
        <div className="game-board__denounce">
          <h2>Dénoncer un joueur</h2>
          <label>
            Qui ?{" "}
            <select
              className="input-sticker"
              value={denounceTargetId}
              onChange={(e) => setDenounceTargetId(e.target.value)}
            >
              <option value="">Choisir...</option>
              {otherAlivePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pourquoi ?{" "}
            <input
              className="input-sticker"
              value={denounceReason}
              onChange={(e) => setDenounceReason(e.target.value)}
              placeholder="ex: n'a pas fait le geste demandé"
            />
          </label>
          <button
            type="button"
            className="btn-sticker"
            disabled={!denounceTargetId || !denounceReason.trim()}
            onClick={() => {
              denouncePlayer(roomId, self.id, denounceTargetId, denounceReason.trim());
              setDenounceTargetId("");
              setDenounceReason("");
            }}
          >
            Dénoncer
          </button>
        </div>
      )}

      {self && gameState.phase === "playing" && needsManualConfirmation && lastManualCardToConfirm && (
        <div className="game-board__manual-confirm">
          <p>
            Tu viens de jouer « {lastManualCardToConfirm.name} » (carte manuelle) : {lastManualCardToConfirm.text}
          </p>
          <button
            type="button"
            className="btn-sticker"
            onClick={() => {
              confirmManualAction(roomId, self.id, lastManualCardToConfirm.id);
              setConfirmedCardId(lastManualCardToConfirm.id);
            }}
          >
            J&apos;ai bien respecté cette carte
          </button>
        </div>
      )}

      {self && gameState.phase === "playing" && !gameState.pendingVote && mustPassHotPotato && (
        <div className="game-board__warning">
          <p>Tu as la Patate chaude ! Passe-la avant de jouer une carte, sinon tu seras éliminé.</p>
          <button type="button" className="btn-sticker" onClick={() => passHotPotato(roomId, self.id)}>
            Passer la Patate chaude
          </button>
        </div>
      )}

    </div>
  );
}
