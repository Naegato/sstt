import { describe, expect, it } from "bun:test";
import { GameService } from "../../src/services/game-service.js";
import { RoomManager } from "../../src/services/room-manager.js";

function makeService() {
  const roomManager = new RoomManager();
  return { roomManager, gameService: new GameService(roomManager) };
}

describe("GameService", () => {
  it("applique un event au moteur, met à jour la room et journalise l'event", () => {
    const { roomManager, gameService } = makeService();

    const result = gameService.handleEvent("room-1", {
      type: "PLAYER_JOINED",
      playerId: "p1",
      playerName: "Alice",
      timestamp: 1,
    });

    expect(result.state.players).toHaveLength(1);
    expect(roomManager.getRoom("room-1")?.state.players).toHaveLength(1);
    expect(gameService.getEventLog("room-1")).toHaveLength(1);
  });

  it("startGame distribue les mains via un deck mélangé au préalable (déterminisme du moteur préservé)", () => {
    const { gameService } = makeService();

    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 });
    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 });

    const result = gameService.startGame("room-1");

    expect(result.state.phase).toBe("playing");
    expect(result.state.players.every((p) => p.hand.length === 2)).toBe(true);

    const startedEvent = gameService.getEventLog("room-1").find((e) => e.type === "GAME_STARTED");
    expect(startedEvent?.type).toBe("GAME_STARTED");
    if (startedEvent?.type === "GAME_STARTED") {
      // Le deck mélangé est bien porté par l'event, pas régénéré par le moteur.
      expect(startedEvent.deck.length).toBeGreaterThan(0);
    }
  });

  it("garde des rooms indépendantes entre elles", () => {
    const { gameService } = makeService();

    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 });
    gameService.handleEvent("room-2", { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 1 });

    expect(gameService.getEventLog("room-1")).toHaveLength(1);
    expect(gameService.getEventLog("room-2")).toHaveLength(1);
  });
});
