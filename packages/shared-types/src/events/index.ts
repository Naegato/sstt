import type { Card, CardId, PlayerId, VoteChoice } from "../game/types.js";

type BaseEvent = { timestamp: number };

export type PlayerJoinedEvent = BaseEvent & {
  type: "PLAYER_JOINED";
  playerId: PlayerId;
  playerName: string;
};

export type GameStartedEvent = BaseEvent & {
  type: "GAME_STARTED";
  /**
   * Deck déjà mélangé, dans l'ordre de pioche. Le mélange (aléatoire) se fait côté
   * service AVANT de créer l'event — le moteur pur ne mélange jamais lui-même,
   * pour garantir que rejouer les mêmes events produit toujours le même état.
   */
  deck: Card[];
};

export type CardDrawnEvent = BaseEvent & {
  type: "CARD_DRAWN";
  playerId: PlayerId;
  cardId: CardId;
};

export type CardPlayedEvent = BaseEvent & {
  type: "CARD_PLAYED";
  playerId: PlayerId;
  cardId: CardId;
  targetPlayerId?: PlayerId;
  /**
   * Réservé aux cartes à double usage (ex: Embuscade de chatons, effet
   * `CANCEL_LAST_PLAYED_CARD`) : `true` = jouée en interruption, hors tour, à
   * tout moment — seul l'effet d'interruption s'applique. `false`/absent =
   * jouée normalement à son tour, les autres effets de la carte s'appliquent.
   */
  playedAsInterrupt?: boolean;
  /**
   * Réservé aux cartes nécessitant de l'aléatoire (ex: Politique, effet
   * `RESHUFFLE_ALL_HANDS_AND_REDRAW`) : ordre de pioche déjà mélangé, calculé
   * côté service AVANT de construire l'event (même principe que
   * `GameStartedEvent.deck` — le moteur pur ne mélange jamais lui-même).
   */
  shuffledDrawPileOrder?: Card[];
  /**
   * Réservé à "Ninjas" (effet `STEAL_RANDOM_CARD_AND_FORCE_PLAY`) : id de la
   * carte tirée au hasard dans la main de `targetPlayerId`, calculé côté
   * service AVANT de construire l'event (même principe que
   * `shuffledDrawPileOrder`) — le moteur pur ne tire jamais au hasard
   * lui-même. Absent si la main de la cible est vide (rien à voler).
   */
  stolenCardId?: CardId;
};

/** Confirmation déclarative qu'un effet manuel (texte affiché) a bien été exécuté. */
export type ManualActionConfirmedEvent = BaseEvent & {
  type: "MANUAL_ACTION_CONFIRMED";
  playerId: PlayerId;
  cardId: CardId;
};

/** Un autre joueur conteste qu'une action manuelle ait bien été respectée. */
export type EliminationChallengedEvent = BaseEvent & {
  type: "ELIMINATION_CHALLENGED";
  challengerId: PlayerId;
  targetPlayerId: PlayerId;
  reason: string;
};

export type PlayerEliminatedEvent = BaseEvent & {
  type: "PLAYER_ELIMINATED";
  playerId: PlayerId;
  reason: "cannot_play" | "missed_action" | "card_effect" | "challenge_upheld";
};

export type TurnEndedEvent = BaseEvent & {
  type: "TURN_ENDED";
  playerId: PlayerId;
};

export type GameEndedEvent = BaseEvent & {
  type: "GAME_ENDED";
  winnerIds: PlayerId[] | null;
};

/** Un joueur soumet son vote pour le vote simultané en cours (voir GameState.pendingVote). */
export type VoteCastEvent = BaseEvent & {
  type: "VOTE_CAST";
  playerId: PlayerId;
  choice: VoteChoice;
};

/**
 * Action optionnelle "Pingouins" (`STEAL_ON_TURN_START`) : au début de son
 * propre tour, un joueur qui a cette carte en jeu peut voler `cardId` dans la
 * pile de `targetPlayerId`. Au plus 1 fois par tour (voir GameState.stolenThisTurn).
 */
export type PlayedCardStolenEvent = BaseEvent & {
  type: "STEAL_PLAYED_CARD";
  playerId: PlayerId;
  targetPlayerId: PlayerId;
  cardId: CardId;
};

/**
 * Action obligatoire "Patate chaude" (`MUST_PASS_BEFORE_PLAYING`) : le joueur
 * courant passe la carte au joueur suivant (destinataire déterministe, pas de
 * choix) avant de jouer sa carte. S'il joue sans l'avoir fait, il est éliminé
 * (voir la vérification dans `playCard()`, apps/server/src/engine/cards.ts).
 */
export type HotPotatoPassedEvent = BaseEvent & {
  type: "PASS_HOT_POTATO";
  playerId: PlayerId;
};

export type GameEvent =
  | PlayerJoinedEvent
  | GameStartedEvent
  | CardDrawnEvent
  | CardPlayedEvent
  | ManualActionConfirmedEvent
  | EliminationChallengedEvent
  | PlayerEliminatedEvent
  | TurnEndedEvent
  | GameEndedEvent
  | VoteCastEvent
  | PlayedCardStolenEvent
  | HotPotatoPassedEvent;
