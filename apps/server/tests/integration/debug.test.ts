import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type Socket, io as ioClient } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS, type GameState } from "@card-game/shared-types";
import { buildApp } from "../../src/app.js";

const TEST_PORT = 4124;
const URL = `http://localhost:${TEST_PORT}`;

function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(URL, { transports: ["websocket"] });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function waitForStateUpdate(socket: Socket): Promise<{ state: GameState }> {
  return new Promise((resolve) => {
    socket.once(SERVER_EVENTS.GAME_STATE_UPDATE, resolve);
  });
}

/**
 * Vérifie que /api/debug/* reflète bien ce qui vient d'être joué, persisté en
 * base (voir db/game-events-repository.ts, GameService.persistEvent) — pas
 * juste l'event log en mémoire, qui ne survivrait pas à un redémarrage.
 */
describe("Routes /api/debug (event log persistant)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: TEST_PORT, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("liste une room après que des joueurs l'ont rejointe, avec des noms en clair (DEBUG_TOKEN non défini en test)", async () => {
    const roomId = `debug-room-${Date.now()}`;
    const alice = await connect();
    const bob = await connect();

    const aliceJoined = waitForStateUpdate(alice);
    alice.emit(CLIENT_EVENTS.JOIN_ROOM, { roomId, playerId: "alice", playerName: "Alice" });
    await aliceJoined;

    const bobJoined = waitForStateUpdate(bob);
    bob.emit(CLIENT_EVENTS.JOIN_ROOM, { roomId, playerId: "bob", playerName: "Bob" });
    await bobJoined;

    // Écriture en base fire-and-forget (jamais awaited côté serveur) — laisse
    // le temps à la promesse de s'exécuter avant de lire.
    await new Promise((r) => setTimeout(r, 200));

    const listResponse = await app.inject({ method: "GET", url: "/api/debug/rooms" });
    expect(listResponse.statusCode).toBe(200);
    const { rooms } = listResponse.json() as { rooms: { roomId: string; eventCount: number; playerNames: string[] }[] };
    const room = rooms.find((r) => r.roomId === roomId);
    expect(room).toBeDefined();
    expect(room!.eventCount).toBe(2); // 2 PLAYER_JOINED
    expect(room!.playerNames.sort()).toEqual(["Alice", "Bob"]);

    const eventsResponse = await app.inject({ method: "GET", url: `/api/debug/rooms/${roomId}/events` });
    expect(eventsResponse.statusCode).toBe(200);
    const { events, apiVersions } = eventsResponse.json() as { events: { type: string; playerName?: string }[]; apiVersions: string[] };
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.type === "PLAYER_JOINED")).toBe(true);
    expect(apiVersions).toEqual(["dev"]); // config.API_VERSION par défaut hors build Docker

    const stateResponse = await app.inject({ method: "GET", url: `/api/debug/rooms/${roomId}/state` });
    expect(stateResponse.statusCode).toBe(200);
    const { state } = stateResponse.json() as { state: GameState };
    expect(state.players.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);

    alice.disconnect();
    bob.disconnect();
  });

  it("répond 404 pour une room jamais jouée", async () => {
    const response = await app.inject({ method: "GET", url: "/api/debug/rooms/never-played-room/events" });
    expect(response.statusCode).toBe(404);
  });
});
