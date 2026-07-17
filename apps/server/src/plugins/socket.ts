import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@card-game/shared-types";
import { GameLogicError } from "../engine/index.js";
import { GameService } from "../services/game-service.js";
import { RoomManager } from "../services/room-manager.js";

type JoinRoomPayload = { roomId: string; playerId: string; playerName: string };
type StartGamePayload = { roomId: string };
type PlayCardPayload = { roomId: string; playerId: string; cardId: string; targetPlayerId?: string };

export async function registerSocket(fastify: FastifyInstance): Promise<void> {
  const io = new SocketIOServer(fastify.server, {
    cors: { origin: "*" },
  });

  const roomManager = new RoomManager();
  const gameService = new GameService(roomManager);

  io.on("connection", (socket) => {
    socket.on(CLIENT_EVENTS.JOIN_ROOM, ({ roomId, playerId, playerName }: JoinRoomPayload) => {
      roomManager.registerSocket(roomId, playerId, socket.id);
      void socket.join(roomId);

      try {
        const result = gameService.handleEvent(roomId, {
          type: "PLAYER_JOINED",
          playerId,
          playerName,
          timestamp: Date.now(),
        });

        socket.emit(SERVER_EVENTS.ROOM_JOINED, { roomId, playerId });
        io.to(roomId).emit(SERVER_EVENTS.GAME_STATE_UPDATE, {
          state: result.state,
          sideEffects: result.sideEffects,
        });
      } catch (err) {
        emitError(socket, err);
      }
    });

    // Déclenché par un joueur de la room (v1 : n'importe qui peut démarrer, pas de notion d'hôte pour l'instant).
    socket.on(CLIENT_EVENTS.START_GAME, ({ roomId }: StartGamePayload) => {
      try {
        const result = gameService.startGame(roomId);
        io.to(roomId).emit(SERVER_EVENTS.GAME_STATE_UPDATE, {
          state: result.state,
          sideEffects: result.sideEffects,
        });
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on(CLIENT_EVENTS.PLAY_CARD, ({ roomId, playerId, cardId, targetPlayerId }: PlayCardPayload) => {
      try {
        const result = gameService.handleEvent(roomId, {
          type: "CARD_PLAYED",
          playerId,
          cardId,
          targetPlayerId,
          timestamp: Date.now(),
        });
        io.to(roomId).emit(SERVER_EVENTS.GAME_STATE_UPDATE, {
          state: result.state,
          sideEffects: result.sideEffects,
        });

        if (result.state.phase === "ended") {
          io.to(roomId).emit(SERVER_EVENTS.GAME_OVER, { winnerId: result.state.winnerId });
        }
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on("disconnect", () => {
      const room = roomManager.findRoomBySocketId(socket.id);
      if (room) {
        io.to(room.id).emit(SERVER_EVENTS.PLAYER_LEFT, { socketId: socket.id });
      }
    });
  });

  fastify.decorate("io", io);
}

function emitError(socket: { emit: (event: string, payload: unknown) => void }, err: unknown): void {
  if (err instanceof GameLogicError) {
    socket.emit(SERVER_EVENTS.ERROR, { message: err.message, code: err.code, context: err.context });
    return;
  }
  socket.emit(SERVER_EVENTS.ERROR, { message: err instanceof Error ? err.message : "Erreur inconnue" });
}
