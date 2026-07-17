import { describe, expect, it } from "bun:test";
import type { GameEvent } from "@card-game/shared-types";
import { createInitialState, processEvent, replayEvents } from "../../src/engine/index.js";
import { makeCard, makeDeck } from "../helpers/fixtures.js";

describe("Moteur — boucle de base (rejoindre → démarrer → piocher → jouer → passer le tour)", () => {
  it("distribue 2 cartes à chaque joueur au démarrage et fixe le premier joueur", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const deck = makeDeck(10);
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck }).state;

    expect(state.phase).toBe("playing");
    expect(state.currentPlayerId).toBe("p1");
    expect(state.players.find((p) => p.id === "p1")?.hand).toHaveLength(2);
    expect(state.players.find((p) => p.id === "p2")?.hand).toHaveLength(2);
    expect(state.drawPile).toHaveLength(6); // 10 - 2*2
  });

  it("refuse qu'un joueur rejoigne une partie déjà commencée", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: makeDeck(5) }).state;

    expect(() =>
      processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 3 }),
    ).toThrow();
  });

  it("gère la boucle piocher → jouer → passer le tour sur N joueurs", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: makeDeck(20) }).state;
    expect(state.currentPlayerId).toBe("p1");

    state = processEvent(state, { type: "CARD_DRAWN", playerId: "p1", cardId: "", timestamp: 3 }).state;
    const p1Hand = state.players.find((p) => p.id === "p1")!.hand;
    expect(p1Hand).toHaveLength(3);

    state = processEvent(
      state,
      { type: "CARD_PLAYED", playerId: "p1", cardId: p1Hand[0]!.id, timestamp: 4 },
    ).state;
    expect(state.players.find((p) => p.id === "p1")!.playedCards).toHaveLength(1);
    expect(state.players.find((p) => p.id === "p1")!.hand).toHaveLength(2);

    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 5 }).state;
    expect(state.currentPlayerId).toBe("p2");
  });

  it("saute les joueurs éliminés lors du passage de tour", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: makeDeck(20) }).state;
    state = processEvent(state, { type: "PLAYER_ELIMINATED", playerId: "p2", reason: "card_effect", timestamp: 3 }).state;

    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 }).state;
    expect(state.currentPlayerId).toBe("p3");
  });
});

describe("Moteur — élimination et victoire", () => {
  it("déclare le dernier joueur non éliminé vainqueur", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: makeDeck(10) }).state;

    const result = processEvent(state, { type: "PLAYER_ELIMINATED", playerId: "p1", reason: "card_effect", timestamp: 3 });
    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerId).toBe("p2");
    expect(result.sideEffects).toContainEqual({ type: "GAME_WON", winnerId: "p2" });
  });

  it("ignore tout event une fois la partie terminée", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: makeDeck(10) }).state;
    state = processEvent(state, { type: "PLAYER_ELIMINATED", playerId: "p1", reason: "card_effect", timestamp: 4 }).state;
    expect(state.phase).toBe("ended");

    const result = processEvent(state, { type: "TURN_ENDED", playerId: "p2", timestamp: 5 });
    expect(result.state).toEqual(state);
    expect(result.sideEffects).toEqual([]);
  });
});

describe("Moteur — effets automatisés simples", () => {
  it("DRAW_CARDS : pioche N cartes supplémentaires en jouant la carte", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const drawCard = makeCard({ id: "quatre-a-la-suite", effect: { type: "DRAW_CARDS", count: 4 } });
    const deck = [drawCard, ...makeDeck(10)];
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck }).state;

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: drawCard.id, timestamp: 4 });
    const p1 = result.state.players.find((p) => p.id === "p1")!;

    expect(p1.hand).toHaveLength(1 + 4); // 2 en main - 1 jouée + 4 piochées
    expect(p1.playedCards).toHaveLength(1);
    expect(result.sideEffects).toContainEqual({ type: "CARDS_DRAWN", playerId: "p1", count: 4 });
  });

  it("PLACE_IN_FRONT_OF_TARGET : déplace la carte devant le joueur ciblé, pas soi-même", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const dragonCard = makeCard({ id: "dragon", effect: { type: "PLACE_IN_FRONT_OF_TARGET" } });
    const deck = [dragonCard, ...makeDeck(10)];
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck }).state;

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: dragonCard.id,
      targetPlayerId: "p2",
      timestamp: 4,
    });

    expect(result.state.players.find((p) => p.id === "p1")!.playedCards).toHaveLength(0);
    expect(result.state.players.find((p) => p.id === "p2")!.playedCards).toHaveLength(1);
  });

  it("ELIMINATE_TARGET : élimine le joueur ciblé et vérifie la victoire", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const laserCard = makeCard({ id: "laser", effect: { type: "ELIMINATE_TARGET" } });
    const deck = [laserCard, ...makeDeck(10)];
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck }).state;

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: laserCard.id,
      targetPlayerId: "p2",
      timestamp: 4,
    });

    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true);
    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerId).toBe("p1");
  });

  it("SKIP_NEXT_TURN : le joueur ciblé passe son prochain tour", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const skipCard = makeCard({ id: "reforme", effect: { type: "SKIP_NEXT_TURN" } });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [skipCard, ...makeDeck(10)] }).state;

    state = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: skipCard.id,
      targetPlayerId: "p2",
      timestamp: 3,
    }).state;
    expect(state.players.find((p) => p.id === "p2")!.skipNextTurn).toBe(true);

    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 }).state;
    expect(state.currentPlayerId).toBe("p3"); // p2 sauté
    expect(state.players.find((p) => p.id === "p2")!.skipNextTurn).toBe(false); // flag consommé
  });
});

describe("Moteur — déterminisme et replay (garantie centrale du guidelines.md)", () => {
  it("rejouer la même séquence d'events produit toujours le même état final", () => {
    const deck = makeDeck(10);
    const events: GameEvent[] = [
      { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 100 },
      { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 200 },
      { type: "GAME_STARTED", timestamp: 300, deck },
      { type: "CARD_DRAWN", playerId: "p1", cardId: "", timestamp: 400 },
      { type: "CARD_PLAYED", playerId: "p1", cardId: deck[0]!.id, timestamp: 500 },
      { type: "TURN_ENDED", playerId: "p1", timestamp: 600 },
    ];

    const initial = createInitialState("room-1");
    const state1 = replayEvents(events, initial);
    const state2 = replayEvents(events, initial);
    const state3 = replayEvents(events, createInitialState("room-1"));

    expect(state1).toEqual(state2);
    expect(state1).toEqual(state3);
  });
});
