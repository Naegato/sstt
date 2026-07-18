import { describe, expect, it } from "bun:test";
import type { GameEvent } from "../src/events/index.js";

describe("GameEvent serialization", () => {
  const events: GameEvent[] = [
    { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 100 },
    { type: "GAME_STARTED", timestamp: 200, deck: [] },
    { type: "CARD_DRAWN", playerId: "p1", cardId: "bombe-01", timestamp: 300 },
    { type: "CARD_PLAYED", playerId: "p1", cardId: "bombe-01", targetPlayerId: "p2", timestamp: 400 },
    { type: "MANUAL_ACTION_CONFIRMED", playerId: "p1", cardId: "index-reflexe-01", timestamp: 500 },
    {
      type: "ELIMINATION_CHALLENGED",
      challengerId: "p2",
      targetPlayerId: "p1",
      reason: "a dit 'tu'",
      timestamp: 600,
    },
    { type: "PLAYER_ELIMINATED", playerId: "p1", reason: "card_effect", timestamp: 700 },
    { type: "TURN_ENDED", playerId: "p2", timestamp: 800 },
    { type: "GAME_ENDED", winnerIds: ["p2"], timestamp: 900 },
  ];

  it("round-trips every event type through JSON without data loss", () => {
    for (const event of events) {
      const roundTripped = JSON.parse(JSON.stringify(event));
      expect(roundTripped).toEqual(event);
    }
  });
});
