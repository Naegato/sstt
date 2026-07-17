import type { GameState, PlayerId, RoomId } from "@card-game/shared-types";
import { createInitialState } from "../engine/index.js";

export type Room = {
  id: RoomId;
  state: GameState;
  socketIdByPlayerId: Map<PlayerId, string>;
};

/**
 * Gère les rooms en mémoire (pas de persistance pour l'instant). Ce n'est pas le
 * moteur pur : cette classe fait de l'I/O implicite (état mutable partagé entre
 * connexions), elle vit délibérément hors de `engine/`.
 */
export class RoomManager {
  private rooms = new Map<RoomId, Room>();

  getOrCreateRoom(roomId: RoomId): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { id: roomId, state: createInitialState(roomId), socketIdByPlayerId: new Map() };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  getRoom(roomId: RoomId): Room | undefined {
    return this.rooms.get(roomId);
  }

  updateState(roomId: RoomId, state: GameState): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.state = state;
    }
  }

  registerSocket(roomId: RoomId, playerId: PlayerId, socketId: string): void {
    const room = this.getOrCreateRoom(roomId);
    room.socketIdByPlayerId.set(playerId, socketId);
  }

  findRoomBySocketId(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      for (const registeredSocketId of room.socketIdByPlayerId.values()) {
        if (registeredSocketId === socketId) {
          return room;
        }
      }
    }
    return undefined;
  }

  removeRoom(roomId: RoomId): void {
    this.rooms.delete(roomId);
  }
}
