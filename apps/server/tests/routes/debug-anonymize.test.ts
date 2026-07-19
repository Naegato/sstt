import { describe, expect, it } from "bun:test";
import type { GameEvent, GameState } from "@card-game/shared-types";
import { anonymizeEvents, anonymizeState } from "../../src/routes/debug.js";

describe("anonymizeEvents", () => {
  it("remplace playerName sur PLAYER_JOINED par 'Joueur N', dans l'ordre d'apparition", () => {
    const events: GameEvent[] = [
      { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 },
      { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 },
    ];

    const result = anonymizeEvents(events);

    expect(result).toEqual([
      { type: "PLAYER_JOINED", playerId: "p1", playerName: "Joueur 1", timestamp: 1 },
      { type: "PLAYER_JOINED", playerId: "p2", playerName: "Joueur 2", timestamp: 2 },
    ]);
  });

  it("ne touche jamais les events qui ne portent pas de nom en clair (seul playerId, opaque)", () => {
    const events: GameEvent[] = [
      { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 },
      { type: "TURN_ENDED", playerId: "p1", timestamp: 2 },
    ];

    const result = anonymizeEvents(events);

    expect(result[1]).toEqual({ type: "TURN_ENDED", playerId: "p1", timestamp: 2 });
  });

  it("garde le même mapping id -> Joueur N même si le même joueur réapparaît plus tard (reconnexion)", () => {
    const events: GameEvent[] = [
      { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 },
      { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 },
      { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 3 },
    ];

    const result = anonymizeEvents(events);

    expect((result[2] as { playerName: string }).playerName).toBe("Joueur 1");
  });
});

describe("anonymizeState", () => {
  it("remplace le nom de chaque joueur par 'Joueur N' selon sa position, garde tout le reste inchangé", () => {
    const state = {
      players: [
        { id: "p1", name: "Alice", points: 3, isEliminated: false },
        { id: "p2", name: "Bob", points: 0, isEliminated: true },
      ],
      phase: "playing",
    } as unknown as GameState;

    const result = anonymizeState(state);

    expect(result.players.map((p) => p.name)).toEqual(["Joueur 1", "Joueur 2"]);
    expect(result.players[0]!.points).toBe(3);
    expect(result.players[1]!.isEliminated).toBe(true);
    expect(result.phase).toBe("playing");
  });
});
