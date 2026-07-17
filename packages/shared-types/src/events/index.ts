import type { Card, CardId, PlayerId } from "../game/types.js";

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
  winnerId: PlayerId | null;
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
  | GameEndedEvent;
