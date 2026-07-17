import type { CardId, GameState, PlayerId } from "@card-game/shared-types";

export type SideEffect =
  | { type: "CARDS_DRAWN"; playerId: PlayerId; count: number }
  | { type: "CARD_MOVED_TO_PLAYED"; playerId: PlayerId; cardId: CardId }
  | { type: "TURN_SKIP_SCHEDULED"; playerId: PlayerId }
  | { type: "PLAY_AGAIN_GRANTED"; playerId: PlayerId }
  | { type: "PLAYER_ELIMINATED"; playerId: PlayerId }
  | { type: "GAME_WON"; winnerId: PlayerId };

export type EngineResult = {
  state: GameState;
  sideEffects: SideEffect[];
};
