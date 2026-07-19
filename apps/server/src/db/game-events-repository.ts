import { asc, eq, max, sql } from "drizzle-orm";
import type { GameEvent, RoomId } from "@card-game/shared-types";
import { db } from "./client.js";
import { gameEvents } from "./schema.js";

/**
 * Ecriture fire-and-forget côté appelant (voir GameService.handleEvent) : ne
 * bloque jamais le chemin de jeu, juste loggée en cas d'échec — la DB est un
 * journal d'audit pour le debug, pas une dépendance de la boucle de jeu.
 *
 * `sequence` n'est PAS fourni par l'appelant (contrairement à une première
 * version) : calculé ici via `MAX(sequence) + 1` pour cette room. Un compteur
 * tenu en mémoire côté `GameService` aurait semblé plus simple, mais il
 * repart à 0 à chaque redémarrage du serveur — si la MÊME room (même string)
 * est réutilisée pour une nouvelle partie après un redémarrage (cas réel :
 * bug trouvé en testant), ses nouveaux events entrent en collision avec les
 * anciens déjà en base (contrainte unique `(room_id, sequence)`), et TOUS les
 * events de la nouvelle partie échouent silencieusement à se persister tant
 * que son compteur n'a pas dépassé l'ancien max. Recalculer depuis la vraie
 * base à chaque fois élimine ce problème par construction.
 *
 * Ordre garanti même sous écritures concurrentes pour la même room grâce à
 * `GameService.persistQueues` (chaîne les écritures d'une même room une par
 * une) — sans cette sérialisation en amont, ce MAX+INSERT ne serait pas
 * atomique et pourrait produire des sequences dupliquées sous forte charge.
 */
export async function insertGameEvent(roomId: RoomId, event: GameEvent, apiVersion: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ maxSeq: max(gameEvents.sequence) }).from(gameEvents).where(eq(gameEvents.roomId, roomId));
    const sequence = (row?.maxSeq ?? -1) + 1;
    await tx.insert(gameEvents).values({ roomId, sequence, event, apiVersion });
  });
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
