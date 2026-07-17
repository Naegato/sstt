import type { Card, GameEvent, RoomId } from "@card-game/shared-types";
import { type EngineResult, processEvent } from "../engine/index.js";
import type { RoomManager } from "./room-manager.js";

/**
 * Deck de remplissage temporaire, en attendant le branchement du vrai catalogue
 * de cartes (`assets/cards/cards.csv`) — étape "ajout progressif des cartes" du
 * roadmap. Mélangé avec `Math.random()` ICI, avant de construire l'event
 * GAME_STARTED : le moteur pur, lui, ne mélange jamais rien lui-même.
 */
function buildPlaceholderDeck(size = 60): Card[] {
  const deck: Card[] = Array.from({ length: size }, (_, i) => ({
    id: `placeholder-${i}`,
    name: `Carte ${i}`,
    rarity: "normale",
    text: "Carte de remplissage — le vrai catalogue arrive dans une prochaine étape.",
  }));

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }

  return deck;
}

export class GameService {
  private eventLog = new Map<RoomId, GameEvent[]>();

  constructor(private roomManager: RoomManager) {}

  handleEvent(roomId: RoomId, event: GameEvent): EngineResult {
    const room = this.roomManager.getOrCreateRoom(roomId);
    const result = processEvent(room.state, event);
    this.roomManager.updateState(roomId, result.state);

    const log = this.eventLog.get(roomId) ?? [];
    log.push(event);
    this.eventLog.set(roomId, log);

    return result;
  }

  startGame(roomId: RoomId): EngineResult {
    return this.handleEvent(roomId, {
      type: "GAME_STARTED",
      timestamp: Date.now(),
      deck: buildPlaceholderDeck(),
    });
  }

  getEventLog(roomId: RoomId): GameEvent[] {
    return this.eventLog.get(roomId) ?? [];
  }
}
