import type { FastifyInstance, FastifyRequest } from "fastify";
import type { GameEvent, GameState, PlayerId } from "@card-game/shared-types";
import { config } from "../config/env.js";
import { getEventsForRoom, listRoomsFromDb } from "../db/game-events-repository.js";
import type { GameService } from "../services/game-service.js";
import type { RoomManager } from "../services/room-manager.js";

/**
 * Consultation de l'historique des parties (persisté en base, voir
 * db/game-events-repository.ts — survit aux redémarrages du serveur,
 * contrairement à l'ancien event log en mémoire), pour pouvoir investiguer un
 * bug rapporté après coup. Demande explicite de l'utilisateur après un bug
 * "Bataille" difficile à diagnostiquer sans ça.
 *
 * Anonymisation par défaut (voir `hasDebugAccess`/`anonymize*`) : ces routes
 * sont conçues pour pouvoir devenir publiques un jour (futur replay) sans
 * exposer d'identité — sans le bon `x-debug-token`, les noms de joueurs sont
 * remplacés par "Joueur 1"/"Joueur 2"/... Avec le bon token, les vrais noms
 * apparaissent (nécessaire pour identifier un joueur précis en support/debug).
 */
export default async function debugRoutes(
  fastify: FastifyInstance,
  opts: { gameService: GameService; roomManager: RoomManager },
) {
  const { roomManager } = opts;

  function hasDebugAccess(request: FastifyRequest): boolean {
    return !config.DEBUG_TOKEN || request.headers["x-debug-token"] === config.DEBUG_TOKEN;
  }

  fastify.get("/debug/rooms", async (request) => {
    const authorized = hasDebugAccess(request);
    const dbRooms = await listRoomsFromDb();
    const rooms = dbRooms.map(({ roomId, eventCount, lastEventAt }) => {
      const room = roomManager.getRoom(roomId);
      const names = room?.state.players.map((p) => p.name) ?? [];
      return {
        roomId,
        eventCount,
        lastEventAt,
        phase: room?.state.phase ?? null,
        playerNames: authorized ? names : names.map((_, i) => `Joueur ${i + 1}`),
      };
    });
    return { rooms };
  });

  fastify.get<{ Params: { roomId: string } }>("/debug/rooms/:roomId/events", async (request, reply) => {
    const authorized = hasDebugAccess(request);
    const rows = await getEventsForRoom(request.params.roomId);
    if (rows.length === 0) {
      return reply.status(404).send({ error: "Aucun event connu pour cette room" });
    }
    const events = authorized
      ? rows.map((r) => r.event)
      : anonymizeEvents(rows.map((r) => r.event));
    return {
      roomId: request.params.roomId,
      apiVersions: [...new Set(rows.map((r) => r.apiVersion).filter(Boolean))],
      events,
    };
  });

  fastify.get<{ Params: { roomId: string } }>("/debug/rooms/:roomId/state", async (request, reply) => {
    const room = roomManager.getRoom(request.params.roomId);
    if (!room) {
      return reply.status(404).send({ error: "Room introuvable (pas en mémoire — voir /events pour l'historique persisté)" });
    }
    const state = hasDebugAccess(request) ? room.state : anonymizeState(room.state);
    return { state };
  });
}

/**
 * Seul `PLAYER_JOINED` porte un nom en clair (`playerName`) — tous les autres
 * events ne référencent les joueurs que par `playerId` (UUID opaque côté
 * client, jamais un nom). Mapping stable id -> "Joueur N" dérivé de l'ordre
 * d'apparition des `PLAYER_JOINED` dans l'historique de la room. Exporté pour
 * être testé directement (pas besoin d'une vraie DB/app pour ces deux-là).
 */
export function anonymizeEvents(events: GameEvent[]): GameEvent[] {
  const order: PlayerId[] = [];
  return events.map((event) => {
    if (event.type !== "PLAYER_JOINED") return event;
    if (!order.includes(event.playerId)) order.push(event.playerId);
    return { ...event, playerName: `Joueur ${order.indexOf(event.playerId) + 1}` };
  });
}

export function anonymizeState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p, i) => ({ ...p, name: `Joueur ${i + 1}` })),
  };
}
