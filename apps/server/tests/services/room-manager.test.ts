import { describe, expect, it } from "bun:test";
import { RoomManager } from "../../src/services/room-manager.js";

describe("RoomManager", () => {
  it("crée une room à la volée et la retrouve ensuite", () => {
    const manager = new RoomManager();
    const created = manager.getOrCreateRoom("room-1");

    expect(created.id).toBe("room-1");
    expect(manager.getRoom("room-1")).toBe(created);
  });

  it("ne crée pas deux fois la même room", () => {
    const manager = new RoomManager();
    const first = manager.getOrCreateRoom("room-1");
    const second = manager.getOrCreateRoom("room-1");

    expect(first).toBe(second);
  });

  it("retrouve une room à partir d'un socketId enregistré", () => {
    const manager = new RoomManager();
    manager.registerSocket("room-1", "p1", "socket-abc");

    const room = manager.findRoomBySocketId("socket-abc");
    expect(room?.id).toBe("room-1");
  });

  it("renvoie undefined pour un socketId inconnu", () => {
    const manager = new RoomManager();
    expect(manager.findRoomBySocketId("unknown")).toBeUndefined();
  });
});
