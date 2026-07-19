import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS, type VoteChoice } from "@card-game/shared-types";
import { GameLogicError, type EngineResult } from "../engine/index.js";
import { GameService } from "../services/game-service.js";
import { RoomManager } from "../services/room-manager.js";

type JoinRoomPayload = { roomId: string; playerId: string; playerName: string };
type StartGamePayload = { roomId: string };
type PlayCardPayload = {
  roomId: string;
  playerId: string;
  cardId: string;
  targetPlayerId?: string;
  playedAsInterrupt?: boolean;
  claimWin?: boolean;
};
type EndTurnPayload = { roomId: string; playerId: string };
type CastVotePayload = { roomId: string; playerId: string; choice: VoteChoice };
type StealPlayedCardPayload = { roomId: string; playerId: string; targetPlayerId: string; cardId: string };
type PassHotPotatoPayload = { roomId: string; playerId: string };
type ChallengeEliminationPayload = { roomId: string; challengerId: string; targetPlayerId: string; reason: string };
type ConfirmManualActionPayload = { roomId: string; playerId: string; cardId: string };
type ResetGamePayload = { roomId: string };
type SubmitChoicePayload = { roomId: string; playerId: string; value: string };
type ToggleNoseTouchPayload = { roomId: string; playerId: string; touching: boolean };
type SlapHandPayload = { roomId: string; playerId: string };

export async function registerSocket(fastify: FastifyInstance): Promise<void> {
  const io = new SocketIOServer(fastify.server, {
    cors: { origin: "*" },
  });

  function broadcastResult(roomId: string, result: EngineResult): void {
    io.to(roomId).emit(SERVER_EVENTS.GAME_STATE_UPDATE, { state: result.state, sideEffects: result.sideEffects });
    if (result.state.phase === "ended") {
      io.to(roomId).emit(SERVER_EVENTS.GAME_OVER, { winnerIds: result.state.winnerIds });
    }
  }

  const roomManager = new RoomManager();
  // Le minuteur de "Nez à nez"/"Pied de nez" (voir GameService.scheduleNoseCountdownResolution)
  // résout puis diffuse spontanément, sans event socket entrant — réutilise broadcastResult.
  const gameService = new GameService(roomManager, broadcastResult);

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
        broadcastResult(roomId, result);
      } catch (err) {
        emitError(socket, err);
      }
    });

    // Déclenché par un joueur de la room (v1 : n'importe qui peut démarrer, pas de notion d'hôte pour l'instant).
    socket.on(CLIENT_EVENTS.START_GAME, async ({ roomId }: StartGamePayload) => {
      try {
        const result = await gameService.startGame(roomId);
        broadcastResult(roomId, result);
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on(
      CLIENT_EVENTS.PLAY_CARD,
      ({ roomId, playerId, cardId, targetPlayerId, playedAsInterrupt, claimWin }: PlayCardPayload) => {
        try {
          const result = gameService.playCard(roomId, playerId, cardId, targetPlayerId, playedAsInterrupt, claimWin);
          broadcastResult(roomId, result);
        } catch (err) {
          emitError(socket, err);
        }
      },
    );

    socket.on(CLIENT_EVENTS.END_TURN, ({ roomId, playerId }: EndTurnPayload) => {
      try {
        const result = gameService.endTurn(roomId, playerId);
        broadcastResult(roomId, result);
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on(CLIENT_EVENTS.CAST_VOTE, ({ roomId, playerId, choice }: CastVotePayload) => {
      try {
        const result = gameService.handleEvent(roomId, {
          type: "VOTE_CAST",
          playerId,
          choice,
          timestamp: Date.now(),
        });
        broadcastResult(roomId, result);
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on(CLIENT_EVENTS.STEAL_PLAYED_CARD, ({ roomId, playerId, targetPlayerId, cardId }: StealPlayedCardPayload) => {
      try {
        const result = gameService.stealPlayedCard(roomId, playerId, targetPlayerId, cardId);
        broadcastResult(roomId, result);
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on(CLIENT_EVENTS.PASS_HOT_POTATO, ({ roomId, playerId }: PassHotPotatoPayload) => {
      try {
        const result = gameService.passHotPotato(roomId, playerId);
        broadcastResult(roomId, result);
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on(
      CLIENT_EVENTS.CHALLENGE_ELIMINATION,
      ({ roomId, challengerId, targetPlayerId, reason }: ChallengeEliminationPayload) => {
        try {
          const result = gameService.denouncePlayer(roomId, challengerId, targetPlayerId, reason);
          broadcastResult(roomId, result);
        } catch (err) {
          emitError(socket, err);
        }
      },
    );

    socket.on(CLIENT_EVENTS.CONFIRM_MANUAL_ACTION, ({ roomId, playerId, cardId }: ConfirmManualActionPayload) => {
      try {
        const result = gameService.confirmManualAction(roomId, playerId, cardId);
        broadcastResult(roomId, result);
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on(CLIENT_EVENTS.RESET_GAME, ({ roomId }: ResetGamePayload) => {
      try {
        const result = gameService.resetGame(roomId);
        broadcastResult(roomId, result);
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on(CLIENT_EVENTS.SUBMIT_CHOICE, ({ roomId, playerId, value }: SubmitChoicePayload) => {
      try {
        const result = gameService.submitChoice(roomId, playerId, value);
        broadcastResult(roomId, result);
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on(CLIENT_EVENTS.TOGGLE_NOSE_TOUCH, ({ roomId, playerId, touching }: ToggleNoseTouchPayload) => {
      try {
        const result = gameService.toggleNoseTouch(roomId, playerId, touching);
        broadcastResult(roomId, result);
      } catch (err) {
        emitError(socket, err);
      }
    });

    socket.on(CLIENT_EVENTS.SLAP_HAND, ({ roomId, playerId }: SlapHandPayload) => {
      try {
        const result = gameService.slapHand(roomId, playerId);
        broadcastResult(roomId, result);
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
