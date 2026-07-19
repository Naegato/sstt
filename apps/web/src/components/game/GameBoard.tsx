"use client";

import { useEffect, useState } from "react";
import type { Card as CardType } from "@card-game/shared-types";
import { useGameStore } from "@/stores/gameStore";
import { useSocket } from "@/hooks/useSocket";
import { CardZoomModal } from "./CardZoomModal";
import { ChoicePanel } from "./ChoicePanel";
import { DenunciationPanel } from "./DenunciationPanel";
import { DiscardPileModal } from "./DiscardPileModal";
import { HandSlapPanel } from "./HandSlapPanel";
import { NoseCountdownPanel } from "./NoseCountdownPanel";
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
    submitChoice,
    toggleNoseTouch,
    slapHand,
  } = useSocket();
  const [confirmedCardId, setConfirmedCardId] = useState<string | null>(null);
  // Carte affichée en grand : soit en lecture seule (peek sur une carte posée,
  // pas de confirmAction), soit avec confirmation (carte en main, sur le point
  // d'être jouée — voir handleCardClick/confirmPreview) ; secondaryAction sert
  // au double choix de "Vous avez gagné !" (tenter de gagner / poser pour +N points).
  const [cardModal, setCardModal] = useState<{
    card: CardType;
    confirmAction?: () => void;
    confirmLabel?: string;
    secondaryAction?: () => void;
    secondaryLabel?: string;
  } | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  // "Pingouins" (STEAL_ON_TURN_START) : rien ne signalait qu'on avait ce
  // pouvoir en début de tour, retour explicite de l'utilisateur — on
  // propose maintenant la question ("voulez-vous voler ?"), avec possibilité
  // d'annuler. `stealChoosing` = en train de choisir une cible/carte à voler ;
  // `stealDeclined` = a répondu "non merci" (ou annulé) pour ce tour-ci.
  const [stealChoosing, setStealChoosing] = useState(false);
  const [stealDeclined, setStealDeclined] = useState(false);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);

  useEffect(() => {
    setStealChoosing(false);
    setStealDeclined(false);
  }, [gameState?.currentPlayerId]);

  useEffect(() => {
    if (gameState?.stolenThisTurn) {
      setStealChoosing(false);
    }
  }, [gameState?.stolenThisTurn]);

  // Fin de tour automatique dès qu'on ne peut plus jouer aucune carte ce
  // tour-ci (GameState.hasPlayedThisTurn) — plus besoin de cliquer "Terminer
  // mon tour" à chaque fois, demande explicite de l'utilisateur. Ne se
  // déclenche jamais tant qu'une interaction bloquante est en cours (vote,
  // choix, décompte, course au clic), pour laisser le temps de la résoudre.
  useEffect(() => {
    if (!gameState || !roomId) return;
    const me = gameState.players.find((p) => p.id === playerId);
    const noBlockingPending =
      !gameState.pendingVote && !gameState.pendingChoice && !gameState.pendingNoseCountdown && !gameState.pendingHandSlap;
    if (
      gameState.phase === "playing" &&
      gameState.currentPlayerId === playerId &&
      me &&
      !me.isEliminated &&
      gameState.hasPlayedThisTurn &&
      noBlockingPending
    ) {
      endTurn(roomId, me.id);
    }
  }, [gameState, playerId, roomId, endTurn]);

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
      const canPlayNormally = isMyTurn && !self?.isEliminated && !gameState.hasPlayedThisTurn;
      return !canPlayNormally && !gameState.lastPlayedCard;
    }

    // Règle "1 carte par tour" : verrouille la main dès que la carte du tour
    // est jouée, sauf si un effet vient d'accorder PLAY_AGAIN (remet le
    // marqueur à false côté serveur) — voir GameState.hasPlayedThisTurn.
    return !isMyTurn || Boolean(self?.isEliminated) || gameState.hasPlayedThisTurn;
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

  const submitPlayCard = (card: CardType, targetPlayerId?: string, claimWin?: boolean) => {
    if (!self) return;
    const canBePlayedAsInterrupt = card.effects.some((e) => e.type === "CANCEL_LAST_PLAYED_CARD");
    // Double usage : sur son propre tour -> mode normal (pioche 3) ; sinon
    // -> interruption (annule la dernière carte jouée) — voir isCardDisabled.
    const playedAsInterrupt = canBePlayedAsInterrupt ? !(isMyTurn && !self.isEliminated) : undefined;
    playCard(roomId, self.id, card.id, targetPlayerId, playedAsInterrupt, claimWin);
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
    // Carte injouable en ce moment (pas mon tour, carte déjà jouée ce
    // tour-ci...) : on peut quand même zoomer dessus pour la lire, juste sans
    // pouvoir la jouer — demande explicite de l'utilisateur.
    if (isCardDisabled(card)) {
      setCardModal({ card });
      return;
    }
    // "Vous avez gagné !" et variantes : choix entre tenter de gagner (vérif
    // auto ou vote selon la condition, voir WIN_IF_CONDITION_ELSE_POINTS côté
    // moteur) et simplement poser pour des points garantis — pas de cible.
    const winClaimEffect = card.effects.find((e) => e.type === "WIN_IF_CONDITION_ELSE_POINTS");
    if (winClaimEffect && winClaimEffect.type === "WIN_IF_CONDITION_ELSE_POINTS") {
      setCardModal({
        card,
        confirmAction: () => {
          setCardModal(null);
          submitPlayCard(card, undefined, true);
        },
        confirmLabel: "Tenter de gagner",
        secondaryAction: () => {
          setCardModal(null);
          submitPlayCard(card, undefined, false);
        },
        secondaryLabel: `Poser pour +${winClaimEffect.fallbackPoints} points`,
      });
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
  // N'illumine les adversaires comme cibles de vol qu'après avoir répondu
  // "oui" au prompt ci-dessous (pas juste parce que canSteal est vrai) — sinon
  // ça se rallume automatiquement à chaque tour sans qu'on ait rien demandé.
  const stealableFromPlayerIds =
    canSteal && stealChoosing ? gameState.players.filter((p) => p.id !== playerId).map((p) => p.id) : [];
  const showStealPrompt = canSteal && !stealChoosing && !stealDeclined;

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

      {showStealPrompt && (
        <div className="steal-prompt">
          <p>🐧 Pingouins ! Voulez-vous voler une carte posée chez un adversaire ce tour-ci ?</p>
          <div className="steal-prompt__actions">
            <button type="button" className="btn-sticker" onClick={() => setStealChoosing(true)}>
              Voler une carte
            </button>
            <button type="button" className="btn-sticker btn-sticker--zone" onClick={() => setStealDeclined(true)}>
              Non merci
            </button>
          </div>
        </div>
      )}

      {stealChoosing && (
        <div className="steal-prompt">
          <p>Clique un adversaire (illuminé), puis choisis la carte à lui voler.</p>
          <button
            type="button"
            className="btn-sticker btn-sticker--zone"
            onClick={() => {
              setStealChoosing(false);
              setStealDeclined(true);
            }}
          >
            Annuler le vol
          </button>
        </div>
      )}

      <div className="table">
        <div className="table__surface">
          <TurnIndicator
            players={gameState.players}
            currentPlayerId={gameState.currentPlayerId}
            selfPlayerId={playerId}
            pointsToWin={gameState.pointsToWin}
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

              <button
                type="button"
                className="pile pile--discard pile--clickable"
                onClick={() => setDiscardModalOpen(true)}
              >
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
              </button>
            </div>
          )}

          {self &&
            gameState.phase === "playing" &&
            !gameState.pendingVote &&
            !gameState.pendingChoice &&
            !gameState.pendingNoseCountdown &&
            !gameState.pendingHandSlap && (
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
            </div>
          )}
        </div>
      </div>

      <CardZoomModal
        card={cardModal?.card ?? null}
        onClose={() => setCardModal(null)}
        onConfirm={cardModal?.confirmAction}
        confirmLabel={cardModal?.confirmLabel ?? "Jouer cette carte"}
        onSecondary={cardModal?.secondaryAction}
        secondaryLabel={cardModal?.secondaryLabel}
      />

      <DiscardPileModal
        open={discardModalOpen}
        cards={gameState.discardPile}
        onClose={() => setDiscardModalOpen(false)}
      />

      {gameState.phase === "playing" && gameState.pendingVote && (
        <VotePanel
          pendingVote={gameState.pendingVote}
          selfPlayerId={playerId}
          players={gameState.players}
          onVote={(choice) => self && castVote(roomId, self.id, choice)}
        />
      )}

      {/* Choix simultané à options multiples (Bataille, Chiffre) — voir
          GameState.pendingChoice, distinct de pendingVote (pas juste oui/non). */}
      {gameState.phase === "playing" && gameState.pendingChoice && (
        <ChoicePanel
          pendingChoice={gameState.pendingChoice}
          card={gameState.players
            .flatMap((p) => p.playedCards)
            .find((c) => c.id === gameState.pendingChoice!.cardId)}
          selfPlayerId={playerId}
          onChoose={(value) => self && submitChoice(roomId, self.id, value)}
        />
      )}

      {gameState.phase === "playing" && gameState.pendingNoseCountdown && (
        <NoseCountdownPanel
          pendingNoseCountdown={gameState.pendingNoseCountdown}
          card={gameState.players
            .find((p) => p.id === gameState.pendingNoseCountdown!.holderId)
            ?.playedCards.find((c) => c.id === gameState.pendingNoseCountdown!.cardId)}
          players={gameState.players}
          selfPlayerId={playerId}
          onToggle={(touching) => self && toggleNoseTouch(roomId, self.id, touching)}
        />
      )}

      {gameState.phase === "playing" && gameState.pendingHandSlap && (
        <HandSlapPanel
          pendingHandSlap={gameState.pendingHandSlap}
          card={gameState.players
            .find((p) => p.id === gameState.pendingHandSlap!.holderId)
            ?.playedCards.find((c) => c.id === gameState.pendingHandSlap!.cardId)}
          selfPlayerId={playerId}
          onSlap={() => self && slapHand(roomId, self.id)}
        />
      )}

      {/* Dénonciation : uniquement pour les cartes manuelles "règle en vigueur"
          (Moi, Zombies...) réellement posées sur la table — pas de dénonciation
          générique sans carte à dénoncer. Un bouton par carte active ; ouvre un
          vote à majorité pour le reste de la table (voir ELIMINATION_CHALLENGED
          / startDenunciationVote côté serveur). */}
      {self &&
        gameState.phase === "playing" &&
        !gameState.pendingVote &&
        !gameState.pendingChoice &&
        !gameState.pendingNoseCountdown &&
        !gameState.pendingHandSlap &&
        !self.isEliminated && (
          <DenunciationPanel
            players={gameState.players}
            selfId={playerId}
            openReflexCardId={gameState.openReflexCardId}
            onDenounce={(targetId, reason) => denouncePlayer(roomId, self.id, targetId, reason)}
          />
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

      {self &&
        gameState.phase === "playing" &&
        !gameState.pendingVote &&
        !gameState.pendingChoice &&
        !gameState.pendingHandSlap &&
        mustPassHotPotato && (
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
