import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { type Socket, io as ioClient } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS, type GameState } from "@card-game/shared-types";
import { buildApp } from "../../src/app.js";

const TEST_PORT = 4123;
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

describe("Room + WebSocket — flux complet rejoindre → démarrer → jouer", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: TEST_PORT, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("deux joueurs rejoignent une room, démarrent, et l'un joue une carte visible par l'autre", async () => {
    const roomId = `room-${Date.now()}`;
    const alice = await connect();
    const bob = await connect();

    const aliceJoined = waitForStateUpdate(alice);
    alice.emit(CLIENT_EVENTS.JOIN_ROOM, { roomId, playerId: "alice", playerName: "Alice" });
    await aliceJoined;

    const bobJoined = waitForStateUpdate(bob);
    bob.emit(CLIENT_EVENTS.JOIN_ROOM, { roomId, playerId: "bob", playerName: "Bob" });
    const { state: afterJoin } = await bobJoined;
    expect(afterJoin.players).toHaveLength(2);

    const aliceSeesStart = waitForStateUpdate(alice);
    const bobSeesStart = waitForStateUpdate(bob);
    bob.emit(CLIENT_EVENTS.START_GAME, { roomId });
    const [{ state: startedForAlice }] = await Promise.all([aliceSeesStart, bobSeesStart]);

    expect(startedForAlice.phase).toBe("playing");
    const currentPlayerId = startedForAlice.currentPlayerId;
    expect(currentPlayerId).not.toBeNull();

    const currentPlayer = startedForAlice.players.find((p) => p.id === currentPlayerId)!;
    const cardToPlay = currentPlayer.hand[0]!;
    const currentSocket = currentPlayerId === "alice" ? alice : bob;
    const otherSocket = currentPlayerId === "alice" ? bob : alice;

    const otherSeesPlay = waitForStateUpdate(otherSocket);
    currentSocket.emit(CLIENT_EVENTS.PLAY_CARD, {
      roomId,
      playerId: currentPlayerId,
      cardId: cardToPlay.id,
    });
    const { state: afterPlay } = await otherSeesPlay;

    const playerWhoPlayed = afterPlay.players.find((p) => p.id === currentPlayerId)!;
    expect(playerWhoPlayed.playedCards.map((c) => c.id)).toContain(cardToPlay.id);

    alice.disconnect();
    bob.disconnect();
  });
});
