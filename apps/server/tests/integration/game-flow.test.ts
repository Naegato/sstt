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
    const currentSocket = currentPlayerId === "alice" ? alice : bob;
    const otherSocket = currentPlayerId === "alice" ? bob : alice;
    const otherPlayerId = currentPlayerId === "alice" ? "bob" : "alice";

    // Le vrai catalogue peut distribuer une carte qui exige un joueur cible (Dragon,
    // Réforme des retraites...) ou une carte réactive injouable ici (Vie
    // supplémentaire, Gros nul !...) : sans ça le serveur renvoie une erreur au seul
    // socket émetteur, sans broadcast GAME_STATE_UPDATE -> `otherSeesPlay` timeout.
    const blockingEffects = new Set(["REACT_TO_OWN_ELIMINATION", "REACT_TO_GROUP_ELIMINATION"]);
    const cardToPlay = currentPlayer.hand.find((c) => !c.effects.some((e) => blockingEffects.has(e.type)))!;

    const otherSeesPlay = waitForStateUpdate(otherSocket);
    currentSocket.emit(CLIENT_EVENTS.PLAY_CARD, {
      roomId,
      playerId: currentPlayerId,
      cardId: cardToPlay.id,
      targetPlayerId: otherPlayerId,
    });
    const { state: afterPlay } = await otherSeesPlay;

    // Les cartes avec PLACE_IN_FRONT_OF_TARGET (ex: Dragon) atterrissent dans la
    // pile du joueur CIBLE, pas dans celle de l'auteur — on cherche dans les deux.
    const placedSomewhere = afterPlay.players.some((p) => p.playedCards.some((c) => c.id === cardToPlay.id));
    expect(placedSomewhere).toBe(true);

    alice.disconnect();
    bob.disconnect();
  });
});
