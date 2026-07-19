import { asc, eq, max, sql } from "drizzle-orm";
import type { GameEvent, RoomId } from "@card-game/shared-types";
import { db } from "./client.js";
import { gameEvents } from "./schema.js";

/**
 * Ecriture fire-and-forget (voir GameService.handleEvent) : jamais awaited sur
 * le chemin chaud du jeu, juste loggée en cas d'échec — la DB est un journal
 * d'audit pour le debug, pas une dépendance de la boucle de jeu elle-même.
 */
export async function insertGameEvent(roomId: RoomId, sequence: number, event: GameEvent, apiVersion: string): Promise<void> {
  await db.insert(gameEvents).values({ roomId, sequence, event, apiVersion });
}

export type RoomSummaryRow = { roomId: string; eventCount: number; lastEventAt: Date | null };

/** Une ligne par room distincte, pour GET /api/debug/rooms — pas le détail des events. */
export async function listRoomsFromDb(): Promise<RoomSummaryRow[]> {
  const rows = await db
    .select({
      roomId: gameEvents.roomId,
      eventCount: sql<number>`count(*)::int`,
      lastEventAt: max(gameEvents.createdAt),
    })
    .from(gameEvents)
    .groupBy(gameEvents.roomId);
  return rows;
}

/** Event log complet d'une room, dans l'ordre — voir GET /api/debug/rooms/:roomId/events. */
export async function getEventsForRoom(roomId: RoomId): Promise<{ event: GameEvent; apiVersion: string | null; createdAt: Date }[]> {
  const rows = await db
    .select({ event: gameEvents.event, apiVersion: gameEvents.apiVersion, createdAt: gameEvents.createdAt })
    .from(gameEvents)
    .where(eq(gameEvents.roomId, roomId))
    .orderBy(asc(gameEvents.sequence));
  return rows as { event: GameEvent; apiVersion: string | null; createdAt: Date }[];
}
