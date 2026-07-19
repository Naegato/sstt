import type { CardId, GameState, PlayerId } from "@card-game/shared-types";

export type SideEffect =
  | { type: "CARDS_DRAWN"; playerId: PlayerId; count: number }
  | { type: "CARD_MOVED_TO_PLAYED"; playerId: PlayerId; cardId: CardId }
  | { type: "TURN_SKIP_SCHEDULED"; playerId: PlayerId }
  | { type: "PLAY_AGAIN_GRANTED"; playerId: PlayerId }
  | { type: "PLAYER_ELIMINATED"; playerId: PlayerId }
  | { type: "GAME_WON"; winnerIds: PlayerId[] }
  | { type: "POINTS_ADDED"; playerId: PlayerId; amount: number }
  | { type: "VOTE_STARTED"; cardId: CardId }
  | { type: "VOTE_CAST"; playerId: PlayerId }
  | { type: "CARD_LOST_TO_DISCARD"; playerId: PlayerId }
  | { type: "CARDS_GIVEN"; playerId: PlayerId; count: number }
  | { type: "ELIMINATION_REVERSED"; playerId: PlayerId }
  | { type: "PLAYED_CARD_CANCELLED"; playerId: PlayerId; cardId: CardId }
  | { type: "PLAYED_CARD_STOLEN"; playerId: PlayerId; targetPlayerId: PlayerId; cardId: CardId }
  | { type: "HOT_POTATO_PASSED"; playerId: PlayerId; targetPlayerId: PlayerId; cardId: CardId }
  | { type: "HANDS_RESHUFFLED" }
  | { type: "CARD_DISCARDED_AFTER_PLAY"; playerId: PlayerId; cardId: CardId }
  | { type: "DENUNCIATION_STARTED"; accuserId: PlayerId; accusedId: PlayerId }
  | { type: "CARD_STOLEN_AND_FORCE_PLAYED"; playerId: PlayerId; targetPlayerId: PlayerId; cardId: CardId }
  | { type: "TURN_DIRECTION_REVERSED" }
  | { type: "GAME_RESET" }
  | { type: "CHOICE_STARTED"; cardId: CardId }
  | { type: "CHOICE_MADE"; playerId: PlayerId }
  /** Signale à GameService qu'il doit programmer la résolution automatique (minuteur) dans `seconds` secondes. */
  | { type: "NOSE_COUNTDOWN_STARTED"; seconds: number }
  | { type: "NOSE_TOUCH_CHANGED"; playerId: PlayerId; touching: boolean }
  | { type: "HAND_SLAPPED"; playerId: PlayerId }
  | { type: "HAND_SLAP_STARTED"; cardId: CardId };

export type EngineResult = {
  state: GameState;
  sideEffects: SideEffect[];
};
