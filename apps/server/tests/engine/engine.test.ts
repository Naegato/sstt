import { describe, expect, it } from "bun:test";
import type { GameEvent, GameState } from "@card-game/shared-types";
import { createInitialState, processEvent, replayEvents } from "../../src/engine/index.js";
import { updatePlayer } from "../../src/engine/state.js";
import { castAllVotes, makeCard, makeDeck, setupPlayers, startGame } from "../helpers/fixtures.js";

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

  it("un même playerId qui rejoint deux fois (refresh, double-clic) ne crée pas de doublon", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;

    const result = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice (bis)", timestamp: 2 });

    expect(result.state.players).toHaveLength(1);
    expect(result.state.players[0]!.name).toBe("Alice"); // pas écrasé par le second essai
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

  it("refuse qu'un joueur joue une carte hors de son tour", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: makeDeck(10) }).state;
    expect(state.currentPlayerId).toBe("p1");

    const p2Card = state.players.find((p) => p.id === "p2")!.hand[0]!;
    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: p2Card.id, timestamp: 4 }),
    ).toThrow();
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
    expect(result.state.winnerIds).toEqual(["p2"]);
    expect(result.sideEffects).toContainEqual({ type: "GAME_WON", winnerIds: ["p2"] });
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

    const drawCard = makeCard({ id: "quatre-a-la-suite", effects: [{ type: "DRAW_CARDS", count: 4 }] });
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

    const dragonCard = makeCard({ id: "dragon", effects: [{ type: "PLACE_IN_FRONT_OF_TARGET" }] });
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

    const laserCard = makeCard({ id: "laser", effects: [{ type: "ELIMINATE_TARGET" }] });
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
    expect(result.state.winnerIds).toEqual(["p1"]);
  });

  it("SKIP_NEXT_TURN : le joueur ciblé passe son prochain tour", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const skipCard = makeCard({ id: "reforme", effects: [{ type: "SKIP_NEXT_TURN" }] });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [skipCard, ...makeDeck(10)] }).state;

    state = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: skipCard.id,
      targetPlayerId: "p2",
      timestamp: 3,
    }).state;
    expect(state.players.find((p) => p.id === "p2")!.skipTurns).toBe(1);

    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 }).state;
    expect(state.currentPlayerId).toBe("p3"); // p2 sauté
    expect(state.players.find((p) => p.id === "p2")!.skipTurns).toBe(0); // décompté au passage de tour
  });

  it("ADD_POINTS : ajoute des points et déclare vainqueur au seuil pointsToWin", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const pointsCard = makeCard({ id: "points-1", effects: [{ type: "ADD_POINTS", amount: 8 }] });
    const pointsCard2 = makeCard({ id: "points-2", effects: [{ type: "ADD_POINTS", amount: 8 }] });
    state = processEvent(state, {
      type: "GAME_STARTED",
      timestamp: 3,
      deck: [pointsCard, pointsCard2, ...makeDeck(10)],
    }).state;

    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: pointsCard.id, timestamp: 4 }).state;
    expect(state.players.find((p) => p.id === "p1")!.points).toBe(8);
    expect(state.phase).toBe("playing"); // 8 < 15, pas encore gagné

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: pointsCard2.id, timestamp: 5 });
    expect(result.state.players.find((p) => p.id === "p1")!.points).toBe(16);
    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toEqual(["p1"]);
    expect(result.sideEffects).toContainEqual({ type: "GAME_WON", winnerIds: ["p1"] });
  });

  it("SET_POINTS_TO_WIN : modifie le seuil de victoire par points", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const superPoints = makeCard({
      id: "super-points",
      effects: [
        { type: "SET_POINTS_TO_WIN", value: 100 },
        { type: "ADD_POINTS", amount: 90 },
      ],
    });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [superPoints, ...makeDeck(10)] }).state;

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: superPoints.id, timestamp: 4 });
    expect(result.state.players.find((p) => p.id === "p1")!.points).toBe(90);
    expect(result.state.pointsToWin).toBe(100);
    expect(result.state.phase).toBe("playing"); // 90 < 100, pas encore gagné
  });

  it("CHECK_BOARD_ELIMINATION : élimine tous les joueurs en jeu si le seuil est atteint, sans déclarer de vainqueur", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }

    const bombeEffects = [
      { type: "PLAY_AGAIN" as const },
      { type: "CHECK_BOARD_ELIMINATION" as const, cardName: "Bombe", threshold: 4 },
    ];
    // 3 bombes déjà posées devant p1 avant le début (simulateur direct de l'état).
    const preplaced = Array.from({ length: 3 }, (_, i) => makeCard({ id: `bombe-pre-${i}`, name: "Bombe", effects: bombeEffects }));
    const fourthBombe = makeCard({ id: "bombe-4", name: "Bombe", effects: bombeEffects });

    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [fourthBombe, ...makeDeck(10)] }).state;
    state = {
      ...state,
      players: state.players.map((p) => (p.id === "p1" ? { ...p, playedCards: preplaced } : p)),
    };

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: fourthBombe.id, timestamp: 3 });

    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toBeNull(); // explosion : personne ne gagne
    expect(result.state.players.every((p) => p.isEliminated)).toBe(true);
  });
});

describe("Moteur — cartes danger et contre-cartes (Dragon/Laser/Trou noir/Pluie de flèches)", () => {
  const DANGER_EFFECTS = [
    { type: "PLACE_IN_FRONT_OF_TARGET" as const },
    { type: "ELIMINATE_AT_END_OF_TURN_IF_PRESENT" as const },
  ];

  it("élimine le porteur d'une carte danger à la fin de son propre tour", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const dragon = makeCard({ id: "dragon-1", name: "Dragon", effects: DANGER_EFFECTS });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [dragon, ...makeDeck(10)] }).state;

    // p1 pose le Dragon devant p2.
    state = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: dragon.id,
      targetPlayerId: "p2",
      timestamp: 3,
    }).state;
    expect(state.players.find((p) => p.id === "p2")!.playedCards.map((c) => c.id)).toContain(dragon.id);
    expect(state.players.find((p) => p.id === "p2")!.isEliminated).toBe(false);

    // Le tour de p1 se termine (le Dragon est chez p2, rien ne se passe).
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 }).state;
    expect(state.players.find((p) => p.id === "p2")!.isEliminated).toBe(false);
    expect(state.currentPlayerId).toBe("p2");

    // Le tour de p2 se termine avec le Dragon toujours devant lui → éliminé.
    const result = processEvent(state, { type: "TURN_ENDED", playerId: "p2", timestamp: 5 });
    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true);
    expect(result.state.currentPlayerId).toBe("p3"); // p2 sauté puisqu'éliminé
  });

  it("Bouclier redirige un Dragon présent au lieu de piocher", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const dragon = makeCard({ id: "dragon-1", name: "Dragon", effects: DANGER_EFFECTS });
    const bouclier = makeCard({
      id: "bouclier-1",
      name: "Bouclier",
      effects: [{ type: "REDIRECT_NAMED_CARD_OR_DRAW", matchNames: ["Dragon", "Pluie de flèches"], drawCountIfNone: 2 }],
    });
    // Distribution séquentielle (2 cartes/joueur, p1 puis p2 puis p3) : Dragon en position 0
    // va à p1, Bouclier doit être en position 2-3 pour atterrir dans la main de p2.
    state = processEvent(state, {
      type: "GAME_STARTED",
      timestamp: 2,
      deck: [dragon, makeCard({ id: "filler-1" }), bouclier, ...makeDeck(10)],
    }).state;

    // p1 pose le Dragon devant p2.
    state = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: dragon.id,
      targetPlayerId: "p2",
      timestamp: 3,
    }).state;
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 }).state;

    // p2 joue Bouclier en ciblant p3 : le Dragon doit partir chez p3, pas de pioche.
    const handSizeBefore = state.players.find((p) => p.id === "p2")!.hand.length;
    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p2",
      cardId: bouclier.id,
      targetPlayerId: "p3",
      timestamp: 5,
    });

    const p2After = result.state.players.find((p) => p.id === "p2")!;
    const p3After = result.state.players.find((p) => p.id === "p3")!;
    expect(p2After.playedCards.some((c) => c.name === "Dragon")).toBe(false);
    expect(p3After.playedCards.some((c) => c.name === "Dragon")).toBe(true);
    expect(p2After.hand.length).toBe(handSizeBefore - 1); // Bouclier quitte la main, redirection ne pioche rien
  });

  it("Bouclier pioche 2 cartes si aucun Dragon/Pluie de flèches n'est présent", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const bouclier = makeCard({
      id: "bouclier-1",
      name: "Bouclier",
      effects: [{ type: "REDIRECT_NAMED_CARD_OR_DRAW", matchNames: ["Dragon", "Pluie de flèches"], drawCountIfNone: 2 }],
    });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [bouclier, ...makeDeck(10)] }).state;

    const handSizeBefore = state.players.find((p) => p.id === "p1")!.hand.length;
    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: bouclier.id, timestamp: 4 });

    const p1After = result.state.players.find((p) => p.id === "p1")!;
    expect(p1After.hand.length).toBe(handSizeBefore - 1 + 2); // -1 (Bouclier joué) +2 (piochées)
    expect(result.sideEffects).toContainEqual({ type: "CARDS_DRAWN", playerId: "p1", count: 2 });
  });
});

describe("Moteur — WIN_IF_ALIVE_COUNT et SKIP_OWN_NEXT_TURNS", () => {
  it("WIN_IF_ALIVE_COUNT : le joueur qui joue la carte gagne si exactement N joueurs sont en jeu", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const conclusion = makeCard({ id: "conclusion", effects: [{ type: "WIN_IF_ALIVE_COUNT", count: 2 }] });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [conclusion, ...makeDeck(10)] }).state;

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: conclusion.id, timestamp: 4 });
    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toEqual(["p1"]);
    expect(result.sideEffects).toContainEqual({ type: "GAME_WON", winnerIds: ["p1"] });
  });

  it("WIN_IF_ALIVE_COUNT : ne fait rien si le nombre de joueurs en jeu ne correspond pas", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const conclusion = makeCard({ id: "conclusion", effects: [{ type: "WIN_IF_ALIVE_COUNT", count: 2 }] });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [conclusion, ...makeDeck(10)] }).state;

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: conclusion.id, timestamp: 3 });
    expect(result.state.phase).toBe("playing"); // 3 joueurs en jeu, pas 2
    expect(result.state.winnerIds).toBeNull();
  });

  it("SKIP_OWN_NEXT_TURNS : l'auteur de la carte (pas la cible) saute plusieurs tours", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const reforme = makeCard({
      id: "reforme",
      effects: [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "SKIP_OWN_NEXT_TURNS", count: 2 }],
    });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [reforme, ...makeDeck(10)] }).state;

    // p1 joue Réforme des retraites en la plaçant devant p2, mais c'est p1 qui saute 2 tours.
    state = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: reforme.id,
      targetPlayerId: "p2",
      timestamp: 3,
    }).state;
    expect(state.players.find((p) => p.id === "p2")!.playedCards.some((c) => c.id === reforme.id)).toBe(true);
    expect(state.players.find((p) => p.id === "p1")!.skipTurns).toBe(2);

    // Ordre cyclique [p1, p2, p3] : p1 n'est revisité par la recherche du prochain
    // joueur qu'après le tour de p3 (son prédécesseur direct dans le cycle).
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 }).state;
    expect(state.currentPlayerId).toBe("p2"); // p1 → p2, normal
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p2", timestamp: 5 }).state;
    expect(state.currentPlayerId).toBe("p3"); // p2 → p3, normal
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p3", timestamp: 6 }).state;
    expect(state.currentPlayerId).toBe("p2"); // p3 → p1 sauté (1er tour consommé) → p2
    expect(state.players.find((p) => p.id === "p1")!.skipTurns).toBe(1);
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p2", timestamp: 7 }).state;
    expect(state.currentPlayerId).toBe("p3"); // p2 → p3, normal (p1 pas revisité ce tour-ci)
    expect(state.players.find((p) => p.id === "p1")!.skipTurns).toBe(1);
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p3", timestamp: 8 }).state;
    expect(state.currentPlayerId).toBe("p2"); // p3 → p1 sauté à nouveau (2e tour consommé) → p2
    expect(state.players.find((p) => p.id === "p1")!.skipTurns).toBe(0);
  });
});

describe("Moteur — vote simultané (carte Cadeaux)", () => {
  function makeCadeauxCard(onYes: "ELIMINATE" | "LOSE_CARD" | "NOTHING", onNo: "ELIMINATE" | "LOSE_CARD" | "NOTHING") {
    return makeCard({ id: "cadeaux-1", name: "Cadeaux", effects: [{ type: "START_SIMULTANEOUS_VOTE", onYes, onNo }] });
  }

  it("ouvre un vote pour tous les joueurs en jeu et bloque TURN_ENDED tant qu'il n'est pas résolu", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const cadeaux = makeCadeauxCard("NOTHING", "ELIMINATE");
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [cadeaux, ...makeDeck(10)] }).state;

    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: cadeaux.id, timestamp: 3 }).state;
    expect(state.pendingVote).not.toBeNull();
    expect(state.pendingVote?.eligiblePlayerIds.sort()).toEqual(["p1", "p2", "p3"]);

    expect(() => processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 })).toThrow();
  });

  it("variante chatons : ceux qui répondent 'non' sont éliminés une fois tous les votes reçus", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const cadeaux = makeCadeauxCard("NOTHING", "ELIMINATE"); // chatons: non → éliminé
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [cadeaux, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: cadeaux.id, timestamp: 3 }).state;

    state = processEvent(state, { type: "VOTE_CAST", playerId: "p1", choice: "oui", timestamp: 4 }).state;
    expect(state.pendingVote).not.toBeNull(); // pas encore tout le monde
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "non", timestamp: 5 }).state;
    expect(state.pendingVote).not.toBeNull();
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p3", choice: "non", timestamp: 6 });

    expect(result.state.pendingVote).toBeNull(); // résolu
    expect(result.state.players.find((p) => p.id === "p1")!.isEliminated).toBe(false); // a dit oui
    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true); // a dit non
    expect(result.state.players.find((p) => p.id === "p3")!.isEliminated).toBe(true); // a dit non
  });

  it("variante serpents : ceux qui répondent 'oui' sont éliminés", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const cadeaux = makeCadeauxCard("ELIMINATE", "NOTHING"); // serpents: oui → éliminé
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [cadeaux, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: cadeaux.id, timestamp: 4 }).state;

    state = processEvent(state, { type: "VOTE_CAST", playerId: "p1", choice: "non", timestamp: 5 }).state;
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "oui", timestamp: 6 });

    // p2 éliminé → il ne reste que p1 en jeu → victoire automatique.
    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toEqual(["p1"]);
  });

  it("variante vides : ceux qui répondent 'oui' perdent une carte (défausse commune), personne n'est éliminé", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const cadeaux = makeCadeauxCard("LOSE_CARD", "NOTHING"); // vides: oui → perd une carte
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [cadeaux, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: cadeaux.id, timestamp: 4 }).state;

    const p2HandBefore = state.players.find((p) => p.id === "p2")!.hand.length;
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p1", choice: "non", timestamp: 5 }).state;
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "oui", timestamp: 6 });

    expect(result.state.players.every((p) => !p.isEliminated)).toBe(true);
    expect(result.state.players.find((p) => p.id === "p2")!.hand.length).toBe(p2HandBefore - 1);
    expect(result.state.discardPile.length).toBe(1);
  });

  it("refuse le vote d'un joueur qui n'est pas éligible", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const cadeaux = makeCadeauxCard("NOTHING", "NOTHING");
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [cadeaux, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: cadeaux.id, timestamp: 4 }).state;

    expect(() =>
      processEvent(state, { type: "VOTE_CAST", playerId: "ghost", choice: "oui", timestamp: 5 }),
    ).toThrow();
  });
});

describe("Moteur — GIVE_CARDS_TO_TARGET (Quatre à la suite)", () => {
  it("pioche puis donne N cartes au joueur ciblé", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const quatre = makeCard({
      id: "quatre-1",
      effects: [{ type: "DRAW_CARDS", count: 4 }, { type: "GIVE_CARDS_TO_TARGET", count: 2 }],
    });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [quatre, ...makeDeck(20)] }).state;
    const p2HandBefore = state.players.find((p) => p.id === "p2")!.hand.length;

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: quatre.id,
      targetPlayerId: "p2",
      timestamp: 4,
    });

    const p1 = result.state.players.find((p) => p.id === "p1")!;
    const p2 = result.state.players.find((p) => p.id === "p2")!;
    // p1: 2 en main - 1 jouée + 4 piochées - 2 données = 3
    expect(p1.hand.length).toBe(3);
    expect(p2.hand.length).toBe(p2HandBefore + 2);
    expect(result.sideEffects).toContainEqual({ type: "CARDS_GIVEN", playerId: "p2", count: 2 });
  });

  it("ne donne que les cartes disponibles si la main est plus petite que le compte demandé", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    // Deck minuscule : après pioche, p1 n'aura presque rien à donner.
    const quatre = makeCard({
      id: "quatre-1",
      effects: [{ type: "DRAW_CARDS", count: 1 }, { type: "GIVE_CARDS_TO_TARGET", count: 5 }],
    });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [quatre, ...makeDeck(3)] }).state;

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: quatre.id,
      targetPlayerId: "p2",
      timestamp: 4,
    });

    expect(result.state.players.find((p) => p.id === "p1")!.hand.length).toBe(0);
  });
});

describe("Moteur — Tricheur (DRAW_CARDS + PLAY_AGAIN combinés)", () => {
  it("pioche 2 cartes et accorde un autre tour", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const tricheur = makeCard({
      id: "tricheur-1",
      effects: [{ type: "DRAW_CARDS", count: 2 }, { type: "PLAY_AGAIN" }],
    });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [tricheur, ...makeDeck(10)] }).state;

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: tricheur.id, timestamp: 4 });

    expect(result.state.players.find((p) => p.id === "p1")!.hand.length).toBe(3); // 2-1+2
    expect(result.sideEffects).toContainEqual({ type: "CARDS_DRAWN", playerId: "p1", count: 2 });
    expect(result.sideEffects).toContainEqual({ type: "PLAY_AGAIN_GRANTED", playerId: "p1" });
    expect(result.state.currentPlayerId).toBe("p1"); // tour pas avancé
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

describe("Moteur — cartes réactives hors tour (Vie supplémentaire)", () => {
  it("un joueur éliminé peut jouer la carte hors tour pour annuler son élimination et piocher 1", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const vieSupp = makeCard({ id: "vie-1", effects: [{ type: "REACT_TO_OWN_ELIMINATION" }] });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [vieSupp, ...makeDeck(20)] }).state;

    // p2 possède la carte mais c'est le tour de p1 ; p2 est éliminé par un tiers effet.
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, vieSupp], isEliminated: true }));
    expect(state.currentPlayerId).toBe("p1"); // toujours le tour de p1

    const handBefore = state.players.find((p) => p.id === "p2")!.hand.length;
    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: vieSupp.id, timestamp: 3 });

    const p2 = result.state.players.find((p) => p.id === "p2")!;
    expect(p2.isEliminated).toBe(false);
    expect(p2.hand.length).toBe(handBefore - 1 + 1); // -1 jouée +1 piochée
    expect(result.sideEffects).toContainEqual({ type: "ELIMINATION_REVERSED", playerId: "p2" });
    expect(result.state.currentPlayerId).toBe("p1"); // le tour n'a pas bougé
  });

  it("refuse qu'un joueur NON éliminé joue une carte réactive", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const vieSupp = makeCard({ id: "vie-1", effects: [{ type: "REACT_TO_OWN_ELIMINATION" }] });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [vieSupp, ...makeDeck(10)] }).state;
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, vieSupp] }));

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: vieSupp.id, timestamp: 4 }),
    ).toThrow();
  });

  it("le joueur réintègre normalement la rotation des tours après s'être sauvé", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const vieSupp = makeCard({ id: "vie-1", effects: [{ type: "REACT_TO_OWN_ELIMINATION" }] });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [vieSupp, ...makeDeck(20)] }).state;
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, vieSupp], isEliminated: true }));
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: vieSupp.id, timestamp: 3 }).state;

    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 }).state;
    expect(state.currentPlayerId).toBe("p2"); // plus sauté, revenu dans la rotation
  });
});

describe("Moteur — vote à majorité (Gâteau ou Tombeau)", () => {
  function makeCakeOrGraveCard() {
    return makeCard({ id: "gateau-1", name: "Gâteau ou Tombeau", effects: [{ type: "START_MAJORITY_VOTE_CAKE_OR_GRAVE" }] });
  }

  it("exclut l'auteur de la carte des joueurs éligibles", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const card = makeCakeOrGraveCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [card, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: card.id, timestamp: 3 }).state;

    expect(state.pendingVote?.mode).toBe("cakeOrGrave");
    expect(state.pendingVote?.eligiblePlayerIds.sort()).toEqual(["p2", "p3"]);
  });

  it("majorité tombeau (oui) → l'auteur de la carte est éliminé", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const card = makeCakeOrGraveCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [card, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: card.id, timestamp: 3 }).state;

    state = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "oui", timestamp: 4 }).state;
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p3", choice: "oui", timestamp: 5 });

    expect(result.state.pendingVote).toBeNull();
    expect(result.state.players.find((p) => p.id === "p1")!.isEliminated).toBe(true);
  });

  it("majorité gâteau (non) → ceux qui ont voté tombeau sont éliminés", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"], ["p4", "Dan"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const card = makeCakeOrGraveCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [card, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: card.id, timestamp: 3 }).state;

    state = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "oui", timestamp: 4 }).state; // tombeau
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p3", choice: "non", timestamp: 5 }).state; // gâteau
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p4", choice: "non", timestamp: 6 }); // gâteau

    expect(result.state.players.find((p) => p.id === "p1")!.isEliminated).toBe(false);
    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true); // a voté tombeau, minoritaire
    expect(result.state.players.find((p) => p.id === "p3")!.isEliminated).toBe(false);
    expect(result.state.players.find((p) => p.id === "p4")!.isEliminated).toBe(false);
  });

  it("égalité (2 votants pairs) → l'auteur de la carte gagne immédiatement la partie", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const card = makeCakeOrGraveCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [card, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: card.id, timestamp: 3 }).state;

    state = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "oui", timestamp: 4 }).state;
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p3", choice: "non", timestamp: 5 });

    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toEqual(["p1"]);
  });
});

describe("Moteur — vote à majorité (La mort ou Tchi-tchi ?)", () => {
  function makeDeathOrTchiCard() {
    return makeCard({
      id: "tchi-1",
      name: "La mort ou Tchi-tchi ?",
      effects: [{ type: "START_MAJORITY_VOTE_DEATH_OR_TCHI" }],
    });
  }

  it("inclut l'auteur de la carte parmi les joueurs éligibles", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const card = makeDeathOrTchiCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [card, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: card.id, timestamp: 4 }).state;

    expect(state.pendingVote?.mode).toBe("deathOrTchi");
    expect(state.pendingVote?.eligiblePlayerIds.sort()).toEqual(["p1", "p2"]);
  });

  it("un seul 'tchi-tchi' → ce joueur gagne immédiatement", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const card = makeDeathOrTchiCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [card, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: card.id, timestamp: 3 }).state;

    state = processEvent(state, { type: "VOTE_CAST", playerId: "p1", choice: "non", timestamp: 4 }).state;
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "oui", timestamp: 5 }).state;
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p3", choice: "non", timestamp: 6 });

    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toEqual(["p2"]);
  });

  it("plusieurs 'tchi-tchi' → ils sont tous éliminés", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const card = makeDeathOrTchiCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [card, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: card.id, timestamp: 3 }).state;

    state = processEvent(state, { type: "VOTE_CAST", playerId: "p1", choice: "oui", timestamp: 4 }).state;
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "oui", timestamp: 5 }).state;
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p3", choice: "non", timestamp: 6 });

    expect(result.state.players.find((p) => p.id === "p1")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p3")!.isEliminated).toBe(false);
  });

  it("aucun 'tchi-tchi' → rien ne se passe", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;

    const card = makeDeathOrTchiCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [card, ...makeDeck(10)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: card.id, timestamp: 4 }).state;

    state = processEvent(state, { type: "VOTE_CAST", playerId: "p1", choice: "non", timestamp: 5 }).state;
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "non", timestamp: 6 });

    expect(result.state.pendingVote).toBeNull();
    expect(result.state.players.every((p) => !p.isEliminated)).toBe(true);
    expect(result.state.phase).toBe("playing");
  });
});

describe("Moteur — cartes réactives hors tour (Gros nul !)", () => {
  function makeCadeauxSerpents() {
    // serpents: "oui" → ELIMINATE, "non" → NOTHING (voir cards-catalog.ts).
    return makeCard({ id: "cadeaux-serpents", name: "Cadeaux", effects: [{ type: "START_SIMULTANEOUS_VOTE", onYes: "ELIMINATE", onNo: "NOTHING" }] });
  }

  function makeGrosNulCard(id = "gros-nul-1") {
    return makeCard({ id, name: "Gros nul !", effects: [{ type: "REACT_TO_GROUP_ELIMINATION" }] });
  }

  /** 4 joueurs, p1 joue Cadeaux (serpents), p2 et p3 votent "oui" → éliminés ensemble, p4 reste en jeu avec p1. */
  function setupGroupElimination() {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"], ["p4", "Dan"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const cadeaux = makeCadeauxSerpents();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [cadeaux, ...makeDeck(20)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: cadeaux.id, timestamp: 3 }).state;

    state = processEvent(state, { type: "VOTE_CAST", playerId: "p1", choice: "non", timestamp: 4 }).state;
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "oui", timestamp: 5 }).state;
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p3", choice: "oui", timestamp: 6 }).state;
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p4", choice: "non", timestamp: 7 });
    return result.state;
  }

  it("ouvre une fenêtre de réaction quand ≥2 joueurs sont éliminés ensemble et que la partie continue", () => {
    const state = setupGroupElimination();

    expect(state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true);
    expect(state.players.find((p) => p.id === "p3")!.isEliminated).toBe(true);
    expect(state.phase).toBe("playing"); // p1 et p4 encore en jeu
    expect(state.lastEliminationBatch?.sort()).toEqual(["p2", "p3"]);
  });

  it("ne s'ouvre pas pour une élimination individuelle (1 seul joueur)", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const cadeaux = makeCadeauxSerpents();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [cadeaux, ...makeDeck(20)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: cadeaux.id, timestamp: 3 }).state;

    state = processEvent(state, { type: "VOTE_CAST", playerId: "p1", choice: "non", timestamp: 4 }).state;
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "non", timestamp: 5 }).state;
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p3", choice: "oui", timestamp: 6 });

    expect(result.state.players.find((p) => p.id === "p3")!.isEliminated).toBe(true);
    expect(result.state.lastEliminationBatch).toBeNull();
  });

  it("un membre du groupe désigne un autre membre pour rester seul éliminé, les autres reviennent", () => {
    let state = setupGroupElimination();
    const grosNul = makeGrosNulCard();
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, grosNul] }));

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p2",
      cardId: grosNul.id,
      targetPlayerId: "p3",
      timestamp: 7,
    });

    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(false); // réintégré
    expect(result.state.players.find((p) => p.id === "p3")!.isEliminated).toBe(true); // seul à porter le chapeau
    expect(result.state.lastEliminationBatch).toBeNull(); // fenêtre consommée
  });

  it("un joueur peut se désigner lui-même (les autres reviennent, lui reste éliminé)", () => {
    let state = setupGroupElimination();
    const grosNul = makeGrosNulCard();
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, grosNul] }));

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p2",
      cardId: grosNul.id,
      targetPlayerId: "p2",
      timestamp: 7,
    });

    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p3")!.isEliminated).toBe(false);
  });

  it("refuse la réaction d'un joueur qui ne fait pas partie du groupe éliminé", () => {
    let state = setupGroupElimination();
    const grosNul = makeGrosNulCard();
    // p4 est toujours en jeu (jamais éliminé) : ne peut pas jouer cette carte réactive.
    state = updatePlayer(state, "p4", (p) => ({ ...p, hand: [...p.hand, grosNul] }));

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p4", cardId: grosNul.id, targetPlayerId: "p2", timestamp: 7 }),
    ).toThrow();
  });

  it("refuse une cible qui ne fait pas partie du groupe éliminé", () => {
    let state = setupGroupElimination();
    const grosNul = makeGrosNulCard();
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, grosNul] }));

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: grosNul.id, targetPlayerId: "p4", timestamp: 7 }),
    ).toThrow();
  });

  it("la fenêtre se ferme à la fin du tour courant", () => {
    let state = setupGroupElimination();
    const grosNul = makeGrosNulCard();
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, grosNul] }));

    state = processEvent(state, { type: "TURN_ENDED", playerId: state.currentPlayerId!, timestamp: 7 }).state;
    expect(state.lastEliminationBatch).toBeNull();

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: grosNul.id, targetPlayerId: "p3", timestamp: 8 }),
    ).toThrow();
  });

  it("la fenêtre se ferme dès qu'une autre carte (non réactive) est jouée", () => {
    let state = setupGroupElimination();
    const grosNul = makeGrosNulCard();
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, grosNul] }));

    // Le joueur courant joue normalement sa carte pendant la fenêtre ouverte.
    const currentId = state.currentPlayerId!;
    const currentHand = state.players.find((p) => p.id === currentId)!.hand;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: currentId, cardId: currentHand[0]!.id, timestamp: 7 }).state;

    expect(state.lastEliminationBatch).toBeNull();
    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: grosNul.id, targetPlayerId: "p3", timestamp: 8 }),
    ).toThrow();
  });
});

describe("Moteur — carte à double usage (Embuscade de chatons)", () => {
  function makeChatonsCard(id = "chatons-1") {
    return makeCard({
      id,
      name: "Embuscade de chatons",
      effects: [{ type: "DRAW_CARDS", count: 3 }, { type: "CANCEL_LAST_PLAYED_CARD" }],
    });
  }

  it("toute carte jouée met à jour lastPlayedCard", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: makeDeck(10) }).state;

    const p1Hand = state.players.find((p) => p.id === "p1")!.hand;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: p1Hand[0]!.id, timestamp: 4 }).state;

    expect(state.lastPlayedCard).toEqual({ cardId: p1Hand[0]!.id, holderId: "p1" });
  });

  it("jouée normalement à son tour : pioche 3 cartes (mode normal, pas d'interruption)", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    const chatons = makeChatonsCard();
    // deck[0] = chatons est distribué directement dans la main de p1 au démarrage
    // (2 cartes de départ) — pas besoin de l'injecter en plus.
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [chatons, ...makeDeck(20)] }).state;

    const drawPileBefore = state.drawPile.length;
    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: chatons.id, timestamp: 4 });

    expect(result.state.players.find((p) => p.id === "p1")!.hand.length).toBe(1 + 3); // 1 carte restante après avoir joué chatons + 3 piochées
    expect(result.state.drawPile.length).toBe(drawPileBefore - 3);
    expect(result.state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.id)).toContain(chatons.id);
  });

  it("jouée en interruption : annule + défausse la dernière carte jouée, pioche 1 en récompense", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const chatons = makeChatonsCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [chatons, ...makeDeck(20)] }).state;
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, chatons] }));

    // p1 (joueur courant) joue une carte normale.
    const p1Hand = state.players.find((p) => p.id === "p1")!.hand;
    const playedCardId = p1Hand[0]!.id;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: playedCardId, timestamp: 3 }).state;
    expect(state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.id)).toContain(playedCardId);

    const p2HandBefore = state.players.find((p) => p.id === "p2")!.hand.length;
    // p2 interrompt hors tour pour annuler la carte que p1 vient de jouer.
    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p2",
      cardId: chatons.id,
      playedAsInterrupt: true,
      timestamp: 4,
    });

    expect(result.state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.id)).not.toContain(playedCardId);
    expect(result.state.discardPile.map((c) => c.id)).toContain(playedCardId);
    expect(result.state.players.find((p) => p.id === "p2")!.hand.length).toBe(p2HandBefore - 1 + 1); // -1 (chatons jouée) +1 (récompense)
    expect(result.state.lastPlayedCard).toEqual({ cardId: chatons.id, holderId: "p2" }); // chatons devient à son tour la cible potentielle
  });

  it("refuse l'interruption s'il n'y a encore aucune carte jouée dans la partie", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    const chatons = makeChatonsCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [chatons, ...makeDeck(20)] }).state;
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, chatons] }));

    expect(() =>
      processEvent(state, {
        type: "CARD_PLAYED",
        playerId: "p2",
        cardId: chatons.id,
        playedAsInterrupt: true,
        timestamp: 4,
      }),
    ).toThrow();
  });

  it("refuse le mode interruption sur une carte qui ne le permet pas", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: makeDeck(20) }).state;

    const p1Hand = state.players.find((p) => p.id === "p1")!.hand;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: p1Hand[0]!.id, timestamp: 4 }).state;

    const ordinaryCard = state.players.find((p) => p.id === "p2")!.hand[0]!;
    expect(() =>
      processEvent(state, {
        type: "CARD_PLAYED",
        playerId: "p2",
        cardId: ordinaryCard.id,
        playedAsInterrupt: true,
        timestamp: 5,
      }),
    ).toThrow();
  });

  it("hors tour sans playedAsInterrupt : refuse toujours (NOT_YOUR_TURN, pas de contournement implicite)", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const chatons = makeChatonsCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [chatons, ...makeDeck(20)] }).state;
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, chatons] }));

    const p1Hand = state.players.find((p) => p.id === "p1")!.hand;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: p1Hand[0]!.id, timestamp: 3 }).state;

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: chatons.id, timestamp: 4 }),
    ).toThrow();
  });

  it("si la carte visée a déjà quitté sa pile d'origine, l'interruption ne fait rien (pas de récompense)", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    const chatons = makeChatonsCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [chatons, ...makeDeck(20)] }).state;
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, chatons] }));

    // Simule une référence lastPlayedCard obsolète (carte déjà retirée de sa pile entre-temps).
    state = { ...state, lastPlayedCard: { cardId: "carte-fantome", holderId: "p1" } };
    const p2HandBefore = state.players.find((p) => p.id === "p2")!.hand.length;

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p2",
      cardId: chatons.id,
      playedAsInterrupt: true,
      timestamp: 4,
    });

    expect(result.state.players.find((p) => p.id === "p2")!.hand.length).toBe(p2HandBefore - 1); // -1 (chatons jouée), pas de récompense
    expect(result.state.discardPile).toHaveLength(0);
  });
});

describe("Moteur — marqueur passif (Rire démoniaque)", () => {
  function makeRireDemoniaqueCard(id = "rire-1") {
    return makeCard({ id, name: "Rire démoniaque", effects: [{ type: "DRAW_ON_ANY_ELIMINATION" }] });
  }

  it("le porteur pioche 1 carte quand un autre joueur est éliminé", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: makeDeck(20) }).state;
    // p1 a déjà "Rire démoniaque" posé devant lui.
    state = updatePlayer(state, "p1", (p) => ({ ...p, playedCards: [makeRireDemoniaqueCard()] }));

    const jaiPerdu = makeCard({ id: "jai-perdu-1", name: "J'ai perdu", effects: [{ type: "ELIMINATE_SELF" }] });
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, jaiPerdu] }));

    const p1HandBefore = state.players.find((p) => p.id === "p1")!.hand.length;
    // p2 n'est éligible que si c'est son tour ; on avance jusqu'à lui pour rester dans les règles.
    while (state.currentPlayerId !== "p2") {
      state = processEvent(state, { type: "TURN_ENDED", playerId: state.currentPlayerId!, timestamp: 5 }).state;
    }
    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: jaiPerdu.id, timestamp: 6 });

    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p1")!.hand.length).toBe(p1HandBefore + 1);
  });

  it("pioche autant de cartes que d'éliminations survenues dans le même event (élimination groupée)", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"], ["p4", "Dan"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    // p1 (le porteur) pioche via Rire démoniaque en jeu, p1 n'est pas concerné par le vote.
    state = updatePlayer(state, "p1", (p) => ({ ...p, playedCards: [makeRireDemoniaqueCard()] }));

    const cadeaux = makeCard({ id: "cadeaux-1", name: "Cadeaux", effects: [{ type: "START_SIMULTANEOUS_VOTE", onYes: "ELIMINATE", onNo: "NOTHING" }] });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [cadeaux, ...makeDeck(20)] }).state;
    while (state.currentPlayerId !== "p2") {
      state = processEvent(state, { type: "TURN_ENDED", playerId: state.currentPlayerId!, timestamp: 3 }).state;
    }
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, cadeaux] }));
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: cadeaux.id, timestamp: 4 }).state;

    const p1HandBefore = state.players.find((p) => p.id === "p1")!.hand.length;
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p1", choice: "non", timestamp: 5 }).state;
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p2", choice: "non", timestamp: 5 }).state;
    state = processEvent(state, { type: "VOTE_CAST", playerId: "p3", choice: "oui", timestamp: 6 }).state;
    const result = processEvent(state, { type: "VOTE_CAST", playerId: "p4", choice: "oui", timestamp: 7 });

    expect(result.state.players.find((p) => p.id === "p3")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p4")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p1")!.hand.length).toBe(p1HandBefore + 2); // 2 éliminations d'un coup
  });

  it("ne se déclenche pas s'il n'y a aucune élimination", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: makeDeck(20) }).state;
    state = updatePlayer(state, "p2", (p) => ({ ...p, playedCards: [makeRireDemoniaqueCard()] }));

    const p2HandBefore = state.players.find((p) => p.id === "p2")!.hand.length;
    const p1Hand = state.players.find((p) => p.id === "p1")!.hand;
    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: p1Hand[0]!.id, timestamp: 4 });

    expect(result.state.players.find((p) => p.id === "p2")!.hand.length).toBe(p2HandBefore);
  });

  it("se déclenche aussi pour une élimination différée en fin de tour (carte danger)", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    state = updatePlayer(state, "p2", (p) => ({ ...p, playedCards: [makeRireDemoniaqueCard()] }));

    const dragon = makeCard({
      id: "dragon-1",
      name: "Dragon",
      effects: [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "ELIMINATE_AT_END_OF_TURN_IF_PRESENT" }],
    });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [dragon, ...makeDeck(20)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: dragon.id, targetPlayerId: "p1", timestamp: 4 }).state;

    const p2HandBefore = state.players.find((p) => p.id === "p2")!.hand.length;
    const result = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 5 });

    expect(result.state.players.find((p) => p.id === "p1")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p2")!.hand.length).toBe(p2HandBefore + 1);
  });

  it("le porteur pioche aussi pour sa propre élimination", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p3", playerName: "Carol", timestamp: 3 }).state;
    state = updatePlayer(state, "p1", (p) => ({ ...p, playedCards: [makeRireDemoniaqueCard()] }));

    const jaiPerdu = makeCard({ id: "jai-perdu-1", name: "J'ai perdu", effects: [{ type: "ELIMINATE_SELF" }] });
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 4, deck: [jaiPerdu, ...makeDeck(20)] }).state;

    const p1HandBefore = state.players.find((p) => p.id === "p1")!.hand.length;
    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: jaiPerdu.id, timestamp: 5 });

    // -1 (carte jouée) puis +1 (Rire démoniaque déclenché par sa propre élimination).
    expect(result.state.players.find((p) => p.id === "p1")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p1")!.hand.length).toBe(p1HandBefore - 1 + 1);
  });
});

describe("Moteur — victoire collective (Câlin de groupe)", () => {
  function makeCalinCard(id = "calin-1") {
    return makeCard({ id, name: "Câlin de groupe", effects: [{ type: "WIN_ALL_ALIVE_PLAYERS" }] });
  }

  it("tous les joueurs encore en jeu gagnent ensemble", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"], ["p4", "Dan"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const calin = makeCalinCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [calin, ...makeDeck(20)] }).state;
    // p3 est éliminé avant que Câlin de groupe soit joué : il ne doit pas gagner avec les autres.
    state = updatePlayer(state, "p3", (p) => ({ ...p, isEliminated: true }));

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: calin.id, timestamp: 3 });

    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds?.sort()).toEqual(["p1", "p2", "p4"]);
    expect(result.sideEffects).toContainEqual({ type: "GAME_WON", winnerIds: expect.arrayContaining(["p1", "p2", "p4"]) });
  });

  it("fonctionne aussi à 2 joueurs (victoire collective des deux)", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    const calin = makeCalinCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [calin, ...makeDeck(20)] }).state;

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: calin.id, timestamp: 4 });

    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds?.sort()).toEqual(["p1", "p2"]);
  });
});

describe("Moteur — règle persistante (Pioche verrouillée !)", () => {
  function makeLockCard(id = "lock-1") {
    return makeCard({ id, name: "Pioche verrouillée !", effects: [{ type: "LOCK_DRAW_PILE" }] });
  }

  it("une fois jouée, plus aucune pioche ne ramène de carte, quelle que soit la source", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    const lock = makeLockCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [lock, ...makeDeck(20)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: lock.id, timestamp: 4 }).state;

    const drawPileBefore = state.drawPile.length;
    const p2HandBefore = state.players.find((p) => p.id === "p2")!.hand.length;

    // Pioche de début de tour (CARD_DRAWN) : ne ramène rien.
    let result = processEvent(state, { type: "CARD_DRAWN", playerId: "p2", cardId: "", timestamp: 5 });
    expect(result.state.players.find((p) => p.id === "p2")!.hand.length).toBe(p2HandBefore);
    expect(result.state.drawPile.length).toBe(drawPileBefore); // rien retiré de la pioche

    // Un effet de carte comme DRAW_CARDS (ex: Tricheur) : ne ramène rien non plus.
    const tricheur = makeCard({ id: "tricheur-1", name: "Tricheur", effects: [{ type: "DRAW_CARDS", count: 2 }] });
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, tricheur] }));
    state = { ...state, currentPlayerId: "p2" };
    const p2HandBeforePlay = state.players.find((p) => p.id === "p2")!.hand.length;
    result = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: tricheur.id, timestamp: 6 });
    // -1 (tricheur jouée) + 0 (pioche bloquée).
    expect(result.state.players.find((p) => p.id === "p2")!.hand.length).toBe(p2HandBeforePlay - 1);
  });

  it("un joueur dont la main est vide après la pioche de son tour est éliminé immédiatement", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const lock = makeLockCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [lock, ...makeDeck(20)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: lock.id, timestamp: 3 }).state;

    // Simule le tour de p2 avec une main déjà vide.
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [] }));
    state = { ...state, currentPlayerId: "p2" };

    const result = processEvent(state, { type: "CARD_DRAWN", playerId: "p2", cardId: "", timestamp: 4 });

    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true);
    expect(result.sideEffects).toContainEqual({ type: "PLAYER_ELIMINATED", playerId: "p2" });
    // La cascade avance au joueur suivant et retente la pioche pour lui.
    expect(result.state.currentPlayerId).toBe("p3");
    expect(result.state.players.find((p) => p.id === "p3")!.isEliminated).toBe(false);
  });

  it("la cascade élimine plusieurs joueurs de suite jusqu'à trouver quelqu'un avec des cartes", () => {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"], ["p4", "Dan"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const lock = makeLockCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [lock, ...makeDeck(20)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: lock.id, timestamp: 3 }).state;

    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [] }));
    state = updatePlayer(state, "p3", (p) => ({ ...p, hand: [] }));
    state = { ...state, currentPlayerId: "p2" };

    const result = processEvent(state, { type: "CARD_DRAWN", playerId: "p2", cardId: "", timestamp: 4 });

    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p3")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p4")!.isEliminated).toBe(false);
    expect(result.state.currentPlayerId).toBe("p4");
  });

  it("si la cascade ne laisse qu'un seul survivant, la partie se termine et il gagne", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    const lock = makeLockCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [lock, ...makeDeck(20)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: lock.id, timestamp: 4 }).state;

    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [] }));
    state = { ...state, currentPlayerId: "p2" };

    const result = processEvent(state, { type: "CARD_DRAWN", playerId: "p2", cardId: "", timestamp: 5 });

    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toEqual(["p1"]);
  });

  it("ne déclenche aucune élimination si le joueur a encore au moins une carte en main", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    const lock = makeLockCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: [lock, ...makeDeck(20)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: lock.id, timestamp: 4 }).state;

    const result = processEvent(state, { type: "CARD_DRAWN", playerId: "p2", cardId: "", timestamp: 5 });

    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(false);
    expect(result.state.phase).toBe("playing");
  });
});

describe("Moteur — vol optionnel au début du tour (Pingouins)", () => {
  function makePingouinsCard(id = "pingouins-1") {
    return makeCard({ id, name: "Pingouins", effects: [{ type: "STEAL_ON_TURN_START" }] });
  }

  function setup() {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const pingouins = makePingouinsCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [pingouins, ...makeDeck(20)] }).state;
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: pingouins.id, timestamp: 3 }).state;
    // Donne à p2 une carte visible à voler.
    const bombeSurP2 = makeCard({ id: "bombe-p2", name: "Bombe" });
    state = updatePlayer(state, "p2", (p) => ({ ...p, playedCards: [...p.playedCards, bombeSurP2] }));
    return { state, pingouins, bombeSurP2 };
  }

  it("le porteur peut voler une carte posée devant un autre joueur pendant son propre tour", () => {
    const { state, bombeSurP2 } = setup();
    const result = processEvent(state, {
      type: "STEAL_PLAYED_CARD",
      playerId: "p1",
      targetPlayerId: "p2",
      cardId: bombeSurP2.id,
      timestamp: 4,
    });

    expect(result.state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.id)).toContain(bombeSurP2.id);
    expect(result.state.players.find((p) => p.id === "p2")!.playedCards.map((c) => c.id)).not.toContain(bombeSurP2.id);
    expect(result.state.stolenThisTurn).toBe(true);
    expect(result.sideEffects).toContainEqual({
      type: "PLAYED_CARD_STOLEN",
      playerId: "p1",
      targetPlayerId: "p2",
      cardId: bombeSurP2.id,
    });
  });

  it("refuse le vol si ce n'est pas le tour du joueur", () => {
    const { state, bombeSurP2 } = setup();
    expect(() =>
      processEvent(state, {
        type: "STEAL_PLAYED_CARD",
        playerId: "p3",
        targetPlayerId: "p2",
        cardId: bombeSurP2.id,
        timestamp: 4,
      }),
    ).toThrow();
  });

  it("refuse le vol si le joueur n'a pas Pingouins en jeu", () => {
    let state = createInitialState("room-1");
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 }).state;
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 }).state;
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 3, deck: makeDeck(20) }).state;
    const bombeSurP2 = makeCard({ id: "bombe-p2", name: "Bombe" });
    state = updatePlayer(state, "p2", (p) => ({ ...p, playedCards: [bombeSurP2] }));

    expect(() =>
      processEvent(state, {
        type: "STEAL_PLAYED_CARD",
        playerId: "p1",
        targetPlayerId: "p2",
        cardId: bombeSurP2.id,
        timestamp: 4,
      }),
    ).toThrow();
  });

  it("refuse un second vol dans le même tour", () => {
    const { state, bombeSurP2 } = setup();
    let next = processEvent(state, {
      type: "STEAL_PLAYED_CARD",
      playerId: "p1",
      targetPlayerId: "p2",
      cardId: bombeSurP2.id,
      timestamp: 4,
    }).state;

    const autreCarteSurP3 = makeCard({ id: "carte-p3", name: "Carte" });
    next = updatePlayer(next, "p3", (p) => ({ ...p, playedCards: [...p.playedCards, autreCarteSurP3] }));

    expect(() =>
      processEvent(next, {
        type: "STEAL_PLAYED_CARD",
        playerId: "p1",
        targetPlayerId: "p3",
        cardId: autreCarteSurP3.id,
        timestamp: 5,
      }),
    ).toThrow();
  });

  it("le vol redevient disponible au tour suivant", () => {
    const { state, bombeSurP2 } = setup();
    let next = processEvent(state, {
      type: "STEAL_PLAYED_CARD",
      playerId: "p1",
      targetPlayerId: "p2",
      cardId: bombeSurP2.id,
      timestamp: 4,
    }).state;
    expect(next.stolenThisTurn).toBe(true);

    // Fait le tour complet de la table pour revenir à p1.
    next = processEvent(next, { type: "TURN_ENDED", playerId: "p1", timestamp: 5 }).state;
    next = processEvent(next, { type: "TURN_ENDED", playerId: "p2", timestamp: 6 }).state;
    next = processEvent(next, { type: "TURN_ENDED", playerId: "p3", timestamp: 7 }).state;
    expect(next.currentPlayerId).toBe("p1");
    expect(next.stolenThisTurn).toBe(false);

    const autreCarteSurP2 = makeCard({ id: "carte-p2-bis", name: "Carte" });
    next = updatePlayer(next, "p2", (p) => ({ ...p, playedCards: [...p.playedCards, autreCarteSurP2] }));
    const result = processEvent(next, {
      type: "STEAL_PLAYED_CARD",
      playerId: "p1",
      targetPlayerId: "p2",
      cardId: autreCarteSurP2.id,
      timestamp: 8,
    });
    expect(result.state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.id)).toContain(autreCarteSurP2.id);
  });

  it("refuse de se voler soi-même", () => {
    const { state } = setup();
    const carteSurP1 = state.players.find((p) => p.id === "p1")!.playedCards[0]!;
    expect(() =>
      processEvent(state, {
        type: "STEAL_PLAYED_CARD",
        playerId: "p1",
        targetPlayerId: "p1",
        cardId: carteSurP1.id,
        timestamp: 4,
      }),
    ).toThrow();
  });

  it("refuse si la carte ciblée n'est pas dans la pile du joueur visé", () => {
    const { state } = setup();
    expect(() =>
      processEvent(state, {
        type: "STEAL_PLAYED_CARD",
        playerId: "p1",
        targetPlayerId: "p2",
        cardId: "carte-inexistante",
        timestamp: 4,
      }),
    ).toThrow();
  });
});

describe("Moteur — action obligatoire (Patate chaude)", () => {
  function makePatateCard(id = "patate-1") {
    return makeCard({
      id,
      name: "Patate chaude",
      effects: [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "MUST_PASS_BEFORE_PLAYING" }],
    });
  }

  function setup() {
    let state = createInitialState("room-1");
    for (const [id, name] of [["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]] as const) {
      state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
    }
    const patate = makePatateCard();
    state = processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck: [patate, ...makeDeck(20)] }).state;
    // p1 pose la Patate chaude devant p2, puis c'est le tour de p2.
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: patate.id, targetPlayerId: "p2", timestamp: 3 }).state;
    state = { ...state, currentPlayerId: "p2" };
    return { state, patate };
  }

  it("le porteur peut la passer au joueur suivant pendant son propre tour", () => {
    const { state } = setup();
    const result = processEvent(state, { type: "PASS_HOT_POTATO", playerId: "p2", timestamp: 4 });

    expect(result.state.players.find((p) => p.id === "p2")!.playedCards).toHaveLength(0);
    expect(result.state.players.find((p) => p.id === "p3")!.playedCards.map((c) => c.name)).toContain("Patate chaude");
    expect(result.sideEffects).toContainEqual({
      type: "HOT_POTATO_PASSED",
      playerId: "p2",
      targetPlayerId: "p3",
      cardId: expect.any(String),
    });
  });

  it("refuse le passage si ce n'est pas le tour du joueur", () => {
    const { state } = setup();
    expect(() => processEvent(state, { type: "PASS_HOT_POTATO", playerId: "p3", timestamp: 4 })).toThrow();
  });

  it("refuse le passage si le joueur n'a pas la Patate chaude", () => {
    const { state } = setup();
    const stateWithoutPotato = { ...state, currentPlayerId: "p1" };
    expect(() => processEvent(stateWithoutPotato, { type: "PASS_HOT_POTATO", playerId: "p1", timestamp: 4 })).toThrow();
  });

  it("saute les joueurs éliminés en cherchant le joueur suivant", () => {
    let { state } = setup();
    state = updatePlayer(state, "p3", (p) => ({ ...p, isEliminated: true }));

    const result = processEvent(state, { type: "PASS_HOT_POTATO", playerId: "p2", timestamp: 4 });

    // p3 éliminé -> retombe sur p1 (le seul autre joueur encore en jeu).
    expect(result.state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.name)).toContain("Patate chaude");
  });

  it("un joueur qui joue une carte sans avoir passé la Patate chaude est éliminé à la place, sa carte reste en main", () => {
    const { state } = setup();
    const p2Hand = state.players.find((p) => p.id === "p2")!.hand;
    const cardToPlay = p2Hand[0]!;

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: cardToPlay.id, timestamp: 4 });

    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p2")!.hand.map((c) => c.id)).toContain(cardToPlay.id);
    // La Patate chaude n'a pas bougé (l'action prévue n'a pas été résolue).
    expect(result.state.players.find((p) => p.id === "p2")!.playedCards.map((c) => c.name)).toContain("Patate chaude");
  });

  it("aucune élimination si le joueur a bien passé la Patate chaude avant de jouer", () => {
    let { state } = setup();
    state = processEvent(state, { type: "PASS_HOT_POTATO", playerId: "p2", timestamp: 4 }).state;

    const p2Hand = state.players.find((p) => p.id === "p2")!.hand;
    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: p2Hand[0]!.id, timestamp: 5 });

    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(false);
  });
});

describe("Moteur — marqueur passif (Dinosaure)", () => {
  function makeDinosaureCard(id = "dino-1") {
    return makeCard({ id, name: "Dinosaure", effects: [{ type: "BLOCK_INCOMING_PLACEMENT" }] });
  }

  it("refuse le placement ciblé (ex: Dragon) sur un joueur protégé par Dinosaure", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const dino = makeDinosaureCard();
    state = startGame(state, [dino, ...makeDeck(20)]);
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: dino.id, timestamp: 3 }).state;
    state = { ...state, currentPlayerId: "p2" };

    const dragon = makeCard({
      id: "dragon-1",
      name: "Dragon",
      effects: [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "ELIMINATE_AT_END_OF_TURN_IF_PRESENT" }],
    });
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, dragon] }));

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: dragon.id, targetPlayerId: "p1", timestamp: 4 }),
    ).toThrow();
  });

  it("n'affecte pas les propres cartes du porteur (placement par défaut sur lui-même)", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const dino = makeDinosaureCard();
    state = startGame(state, [dino, ...makeDeck(20)]);

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: dino.id, timestamp: 3 });

    expect(result.state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.name)).toContain("Dinosaure");
  });

  it("n'affecte pas le placement ciblé sur un joueur non protégé", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const dino = makeDinosaureCard();
    state = startGame(state, [dino, ...makeDeck(20)]);
    // p1 pose Dinosaure devant lui-même ; p2 vise p3 (non protégé) avec un Dragon.
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: dino.id, timestamp: 3 }).state;
    state = { ...state, currentPlayerId: "p2" };

    const dragon = makeCard({
      id: "dragon-1",
      name: "Dragon",
      effects: [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "ELIMINATE_AT_END_OF_TURN_IF_PRESENT" }],
    });
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, dragon] }));

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p2",
      cardId: dragon.id,
      targetPlayerId: "p3",
      timestamp: 4,
    });
    expect(result.state.players.find((p) => p.id === "p3")!.playedCards.map((c) => c.name)).toContain("Dragon");
  });

  it("un vote qui élimine un joueur protégé par Dinosaure fonctionne normalement (la protection ne concerne que le placement)", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const dino = makeDinosaureCard();
    const cadeaux = makeCard({ id: "cadeaux-1", name: "Cadeaux", effects: [{ type: "START_SIMULTANEOUS_VOTE", onYes: "ELIMINATE", onNo: "NOTHING" }] });
    state = startGame(state, [dino, cadeaux, ...makeDeck(20)]);
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: dino.id, timestamp: 3 }).state;
    state = { ...state, currentPlayerId: "p2" };
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, cadeaux] }));
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: cadeaux.id, timestamp: 4 }).state;

    const result = castAllVotes(state, { p1: "oui", p2: "non", p3: "non" });

    expect(result.players.find((p) => p.id === "p1")!.isEliminated).toBe(true);
  });
});

describe("Moteur — aléatoire injecté côté service (Politique)", () => {
  function makePolitiqueCard(id = "politique-1") {
    return makeCard({
      id,
      name: "Politique",
      effects: [{ type: "RESHUFFLE_ALL_HANDS_AND_REDRAW", count: 2 }, { type: "PLAY_AGAIN" }, { type: "DISCARD_SELF" }],
    });
  }

  it("remélange toutes les mains dans la pioche, chaque joueur pioche 2 nouvelles cartes, accorde PLAY_AGAIN, part à la défausse", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const politique = makePolitiqueCard();
    state = startGame(state, [politique, ...makeDeck(20)]);

    const shuffledOrder = makeDeck(30).map((c, i) => ({ ...c, id: `shuffled-${i}` }));
    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: politique.id,
      shuffledDrawPileOrder: shuffledOrder,
      timestamp: 3,
    });

    expect(result.state.players.find((p) => p.id === "p1")!.hand).toHaveLength(2);
    expect(result.state.players.find((p) => p.id === "p2")!.hand).toHaveLength(2);
    expect(result.state.players.find((p) => p.id === "p3")!.hand).toHaveLength(2);
    expect(result.state.drawPile).toHaveLength(shuffledOrder.length - 6); // 3 joueurs x 2 cartes
    expect(result.state.discardPile.map((c) => c.id)).toContain(politique.id);
    expect(result.state.players.find((p) => p.id === "p1")!.playedCards).toHaveLength(0); // pas posée devant l'auteur
    expect(result.sideEffects).toContainEqual({ type: "PLAY_AGAIN_GRANTED", playerId: "p1" });
  });

  it("respecte Pioche verrouillée ! : les mains sont vidées mais personne ne repioche", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const lock = makeCard({ id: "lock-1", name: "Pioche verrouillée !", effects: [{ type: "LOCK_DRAW_PILE" }] });
    const politique = makePolitiqueCard();
    state = startGame(state, [lock, politique, ...makeDeck(20)]);
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: lock.id, timestamp: 3 }).state;

    const shuffledOrder = makeDeck(10).map((c, i) => ({ ...c, id: `shuffled-${i}` }));
    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: politique.id,
      shuffledDrawPileOrder: shuffledOrder,
      timestamp: 4,
    });

    expect(result.state.players.find((p) => p.id === "p1")!.hand).toHaveLength(0);
    expect(result.state.players.find((p) => p.id === "p2")!.hand).toHaveLength(0);
    expect(result.state.drawPile.map((c) => c.id)).toEqual(shuffledOrder.map((c) => c.id)); // intact, personne n'a pioché
  });

  it("refuse si aucun ordre de pioche mélangé n'est fourni (bug côté service, pas côté joueur)", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const politique = makePolitiqueCard();
    state = startGame(state, [politique, ...makeDeck(20)]);

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: politique.id, timestamp: 3 }),
    ).toThrow();
  });
});

describe("Moteur — réaction après victoire (Enfoiré !)", () => {
  function makeEnfoireCard(id = "enfoire-1") {
    return makeCard({ id, name: "Enfoiré !", effects: [{ type: "REACT_TO_OTHER_PLAYER_VICTORY" }] });
  }

  /** p1 gagne par points sans éliminer personne d'autre. */
  function makeWinCard(id = "win-1") {
    return makeCard({ id, name: "WinCard", effects: [{ type: "SET_POINTS_TO_WIN", value: 10 }, { type: "ADD_POINTS", amount: 10 }] });
  }

  it("élimine le vainqueur ET le porteur ; la partie reprend s'il reste ≥2 joueurs", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"], ["p4", "Dan"]]);
    const winCard = makeWinCard();
    state = startGame(state, [winCard, ...makeDeck(20)]);
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: winCard.id, timestamp: 3 }).state;
    expect(state.phase).toBe("ended");
    expect(state.winnerIds).toEqual(["p1"]);

    const enfoire = makeEnfoireCard();
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, enfoire] }));
    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: enfoire.id, timestamp: 4 });

    expect(result.state.players.find((p) => p.id === "p1")!.isEliminated).toBe(true);
    expect(result.state.players.find((p) => p.id === "p2")!.isEliminated).toBe(true);
    expect(result.state.phase).toBe("playing"); // p3, p4 encore en jeu
    expect(result.state.winnerIds).toBeNull();
    expect(["p3", "p4"]).toContain(result.state.currentPlayerId!);
  });

  it("si un seul survivant reste après la réaction, la partie se termine avec lui comme vainqueur", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const winCard = makeWinCard();
    state = startGame(state, [winCard, ...makeDeck(20)]);
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: winCard.id, timestamp: 3 }).state;

    const enfoire = makeEnfoireCard();
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, enfoire] }));
    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: enfoire.id, timestamp: 4 });

    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toEqual(["p3"]);
  });

  it("si personne ne survit à la réaction, la partie se termine sans vainqueur", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const winCard = makeWinCard();
    state = startGame(state, [winCard, ...makeDeck(20)]);
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: winCard.id, timestamp: 3 }).state;

    const enfoire = makeEnfoireCard();
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, enfoire] }));
    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: enfoire.id, timestamp: 4 });

    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toBeNull();
  });

  it("refuse si la partie n'est pas terminée", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const enfoire = makeEnfoireCard();
    state = startGame(state, [enfoire, ...makeDeck(20)]);

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: enfoire.id, timestamp: 3 }),
    ).toThrow();
  });

  it("refuse si le porteur est lui-même le vainqueur", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const winCard = makeWinCard();
    const enfoire = makeEnfoireCard();
    state = startGame(state, [winCard, enfoire, ...makeDeck(20)]);
    // deck[0]=winCard, deck[1]=enfoire -> tous deux dans la main de p1.
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: winCard.id, timestamp: 3 }).state;

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: enfoire.id, timestamp: 4 }),
    ).toThrow();
  });

  it("refuse si le porteur a déjà été éliminé (le vainqueur l'a éliminé)", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const winCard = makeWinCard();
    state = startGame(state, [winCard, ...makeDeck(20)]);
    state = updatePlayer(state, "p2", (p) => ({ ...p, isEliminated: true }));
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: winCard.id, timestamp: 3 }).state;

    const enfoire = makeEnfoireCard();
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, enfoire] }));

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: enfoire.id, timestamp: 4 }),
    ).toThrow();
  });

  it("refuse contre une victoire collective (plusieurs vainqueurs)", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const calin = makeCard({ id: "calin-1", name: "Câlin de groupe", effects: [{ type: "WIN_ALL_ALIVE_PLAYERS" }] });
    state = startGame(state, [calin, ...makeDeck(20)]);
    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: calin.id, timestamp: 3 }).state;
    expect(state.winnerIds?.sort()).toEqual(["p1", "p2", "p3"]);

    const enfoire = makeEnfoireCard();
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, enfoire] }));

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p2", cardId: enfoire.id, timestamp: 4 }),
    ).toThrow();
  });
});

describe("Moteur — dénonciation (cartes manuelles non respectées)", () => {
  function denounce(state: GameState, challengerId: string, targetPlayerId: string) {
    return processEvent(state, {
      type: "ELIMINATION_CHALLENGED",
      challengerId,
      targetPlayerId,
      reason: "n'a pas fait le geste demandé",
      timestamp: 3,
    });
  }

  it("ouvre un vote qui exclut le dénoncé mais inclut le dénonciateur", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    state = startGame(state, makeDeck(20));

    const result = denounce(state, "p1", "p3");

    expect(result.state.pendingVote?.mode).toBe("denunciation");
    expect(result.state.pendingVote?.eligiblePlayerIds.sort()).toEqual(["p1", "p2"]);
  });

  it("majorité stricte de 'oui' élimine le dénoncé", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"], ["p4", "Dan"]]);
    state = startGame(state, makeDeck(20));
    state = denounce(state, "p1", "p4").state;

    const result = castAllVotes(state, { p1: "oui", p2: "oui", p3: "non" });

    expect(result.players.find((p) => p.id === "p4")!.isEliminated).toBe(true);
    expect(result.pendingVote).toBeNull();
  });

  it("égalité ne fait rien", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    state = startGame(state, makeDeck(20));
    state = denounce(state, "p1", "p3").state;

    const result = castAllVotes(state, { p1: "oui", p2: "non" });

    expect(result.players.find((p) => p.id === "p3")!.isEliminated).toBe(false);
  });

  it("majorité de 'non' ne fait rien", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"], ["p4", "Dan"]]);
    state = startGame(state, makeDeck(20));
    state = denounce(state, "p1", "p4").state;

    const result = castAllVotes(state, { p1: "non", p2: "non", p3: "oui" });

    expect(result.players.find((p) => p.id === "p4")!.isEliminated).toBe(false);
  });

  it("refuse de se dénoncer soi-même", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    state = startGame(state, makeDeck(20));

    expect(() => denounce(state, "p1", "p1")).toThrow();
  });

  it("refuse si le dénonciateur est déjà éliminé", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    state = startGame(state, makeDeck(20));
    state = updatePlayer(state, "p1", (p) => ({ ...p, isEliminated: true }));

    expect(() => denounce(state, "p1", "p2")).toThrow();
  });

  it("refuse si le dénoncé est déjà éliminé", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    state = startGame(state, makeDeck(20));
    state = updatePlayer(state, "p2", (p) => ({ ...p, isEliminated: true }));

    expect(() => denounce(state, "p1", "p2")).toThrow();
  });

  it("refuse si un vote est déjà en cours", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    state = startGame(state, makeDeck(20));
    state = denounce(state, "p1", "p3").state;

    expect(() => denounce(state, "p2", "p1")).toThrow();
  });

  it("bloque la fin de tour tant que le vote n'est pas résolu", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    state = startGame(state, makeDeck(20));
    state = denounce(state, "p1", "p3").state;

    expect(() => processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 })).toThrow();
  });
});

describe("Moteur — marqueur différé (Finito)", () => {
  function makeFinitoCard(id = "finito-1") {
    return makeCard({ id, name: "Finito", effects: [{ type: "SCHEDULE_ELIMINATE_ALL_NEXT_TURN_END" }] });
  }

  it("n'élimine personne à la fin du tour où elle est jouée (juste armée)", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const finito = makeFinitoCard();
    state = startGame(state, [finito, ...makeDeck(20)]);

    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: finito.id, timestamp: 3 }).state;
    expect(state.pendingFinito).toEqual({ holderId: "p1", primed: false });

    const result = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 });
    expect(result.state.phase).toBe("playing");
    expect(result.state.players.every((p) => !p.isEliminated)).toBe(true);
    expect(result.state.pendingFinito).toEqual({ holderId: "p1", primed: true });
    expect(result.state.currentPlayerId).toBe("p2");
  });

  it("élimine tout le monde, y compris le porteur, à la fin de son tour suivant", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const finito = makeFinitoCard();
    state = startGame(state, [finito, ...makeDeck(20)]);

    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: finito.id, timestamp: 3 }).state;
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 }).state; // armée, tour -> p2
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p2", timestamp: 5 }).state; // tour -> p3
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p3", timestamp: 6 }).state; // tour -> p1
    const result = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 7 }); // fin du tour SUIVANT de p1 → déclenche

    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toBeNull();
    expect(result.state.players.every((p) => p.isEliminated)).toBe(true);
    expect(result.state.pendingFinito).toBeNull();
  });

  it("un autre joueur qui termine son tour entre-temps ne déclenche rien", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const finito = makeFinitoCard();
    state = startGame(state, [finito, ...makeDeck(20)]);

    state = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: finito.id, timestamp: 3 }).state;
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 }).state; // armée

    const result = processEvent(state, { type: "TURN_ENDED", playerId: "p2", timestamp: 5 });
    expect(result.state.phase).toBe("playing");
    expect(result.state.players.every((p) => !p.isEliminated)).toBe(true);
    expect(result.state.pendingFinito).toEqual({ holderId: "p1", primed: true });
  });
});

describe("Moteur — vol + jeu forcé (Ninjas)", () => {
  function makeNinjasCard(id = "ninjas-1") {
    return makeCard({ id, name: "Ninjas", effects: [{ type: "STEAL_RANDOM_CARD_AND_FORCE_PLAY" }] });
  }

  it("vole la carte désignée (stolenCardId) et la joue immédiatement (placement par défaut = devant le voleur)", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const ninjas = makeNinjasCard();
    const stolen = makeCard({ id: "manual-1", name: "Zombies", effects: [] });
    state = startGame(state, [ninjas, ...makeDeck(20)]);
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, stolen] }));

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: ninjas.id,
      targetPlayerId: "p2",
      stolenCardId: stolen.id,
      timestamp: 3,
    });

    expect(result.state.players.find((p) => p.id === "p2")!.hand.some((c) => c.id === stolen.id)).toBe(false);
    expect(result.state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.id)).toEqual([
      ninjas.id,
      stolen.id,
    ]);
    expect(result.state.lastPlayedCard).toEqual({ cardId: stolen.id, holderId: "p1" });
  });

  it("si la carte volée nécessite une cible, réutilise le joueur visé par Ninjas par défaut", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const ninjas = makeNinjasCard();
    const dragon = makeCard({
      id: "dragon-1",
      name: "Dragon",
      effects: [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "ELIMINATE_AT_END_OF_TURN_IF_PRESENT" }],
    });
    state = startGame(state, [ninjas, ...makeDeck(20)]);
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, dragon] }));

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: ninjas.id,
      targetPlayerId: "p2",
      stolenCardId: dragon.id,
      timestamp: 3,
    });

    // Le Dragon volé est placé devant p2 (la cible désignée par Ninjas), pas devant p1.
    expect(result.state.players.find((p) => p.id === "p2")!.playedCards.map((c) => c.id)).toContain(dragon.id);
    expect(result.state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.id)).toEqual([ninjas.id]);
  });

  it("ne fait rien si la main de la cible est vide (pas de stolenCardId)", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const ninjas = makeNinjasCard();
    state = startGame(state, [ninjas, ...makeDeck(20)]);
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [] }));

    const result = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: ninjas.id,
      targetPlayerId: "p2",
      timestamp: 3,
    });

    expect(result.state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.id)).toEqual([ninjas.id]);
    expect(result.state.players.find((p) => p.id === "p2")!.hand).toEqual([]);
  });

  it("refuse sans joueur cible", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const ninjas = makeNinjasCard();
    state = startGame(state, [ninjas, ...makeDeck(20)]);

    expect(() =>
      processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: ninjas.id, timestamp: 3 }),
    ).toThrow();
  });

  it("respecte le Dinosaure de la cible pour la carte volée redirigée", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const ninjas = makeNinjasCard();
    const dinosaure = makeCard({ id: "dino-1", name: "Dinosaure", effects: [{ type: "BLOCK_INCOMING_PLACEMENT" }] });
    const dragon = makeCard({
      id: "dragon-1",
      name: "Dragon",
      effects: [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "ELIMINATE_AT_END_OF_TURN_IF_PRESENT" }],
    });
    state = startGame(state, [ninjas, ...makeDeck(20)]);
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, dragon], playedCards: [dinosaure] }));

    expect(() =>
      processEvent(state, {
        type: "CARD_PLAYED",
        playerId: "p1",
        cardId: ninjas.id,
        targetPlayerId: "p2",
        stolenCardId: dragon.id,
        timestamp: 3,
      }),
    ).toThrow();
  });
});

describe("Moteur — révélation + victoire conditionnelle (Foire aux bombes)", () => {
  function makeFoireCard(id = "foire-1") {
    return makeCard({ id, name: "Foire aux bombes", effects: [{ type: "REVEAL_BOMBS_AND_WIN_IF_ENOUGH", threshold: 4 }] });
  }
  function makeBombe(id: string) {
    return makeCard({ id, name: "Bombe", effects: [] });
  }

  it("révèle les Bombes de chaque main sans faire gagner si le total reste sous le seuil", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const foire = makeFoireCard();
    state = startGame(state, [foire, ...makeDeck(20)]);
    state = updatePlayer(state, "p1", (p) => ({ ...p, hand: [...p.hand, makeBombe("b1")] }));
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, makeBombe("b2")] }));

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: foire.id, timestamp: 3 });

    expect(result.state.phase).toBe("playing");
    expect(result.state.players.find((p) => p.id === "p1")!.playedCards.map((c) => c.id)).toContain("b1");
    expect(result.state.players.find((p) => p.id === "p2")!.playedCards.map((c) => c.id)).toContain("b2");
    expect(result.state.players.find((p) => p.id === "p1")!.hand.some((c) => c.id === "b1")).toBe(false);
  });

  it("fait gagner l'auteur si le total de Bombes révélées atteint le seuil", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const foire = makeFoireCard();
    state = startGame(state, [foire, ...makeDeck(20)]);
    state = updatePlayer(state, "p1", (p) => ({ ...p, hand: [...p.hand, makeBombe("b1"), makeBombe("b2")] }));
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, makeBombe("b3")] }));
    state = updatePlayer(state, "p3", (p) => ({ ...p, hand: [...p.hand, makeBombe("b4")] }));

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: foire.id, timestamp: 3 });

    expect(result.state.phase).toBe("ended");
    expect(result.state.winnerIds).toEqual(["p1"]);
  });

  it("ne touche pas les cartes non-Bombe des mains", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"]]);
    const foire = makeFoireCard();
    const other = makeCard({ id: "other-1", name: "Zombies", effects: [] });
    state = startGame(state, [foire, ...makeDeck(20)]);
    state = updatePlayer(state, "p2", (p) => ({ ...p, hand: [...p.hand, other] }));

    const result = processEvent(state, { type: "CARD_PLAYED", playerId: "p1", cardId: foire.id, timestamp: 3 });

    expect(result.state.players.find((p) => p.id === "p2")!.hand.some((c) => c.id === "other-1")).toBe(true);
  });
});

describe("Moteur — sens de rotation (Gilet jaune)", () => {
  function makeGiletCard(id = "gilet-1") {
    return makeCard({
      id,
      name: "Gilet jaune",
      effects: [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "REVERSE_DIRECTION_AND_SKIP_IF_PRESENT" }],
    });
  }

  it("saute le tour du porteur, défausse la carte, et inverse le sens de rotation", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const gilet = makeGiletCard();
    state = startGame(state, [gilet, ...makeDeck(20)]);

    // p1 pose Gilet jaune devant p2.
    state = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: gilet.id,
      targetPlayerId: "p2",
      timestamp: 3,
    }).state;
    expect(state.turnDirection).toBe(1);

    // Le tour de p1 se termine : la rotation normale (p2) est interceptée par
    // Gilet jaune -> défaussée, sens inversé, p2 sauté -> on continue vers p3
    // (le "précédent" dans le nouveau sens inversé, donc p3 avant p1).
    const result = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 });

    expect(result.state.turnDirection).toBe(-1);
    expect(result.state.currentPlayerId).toBe("p3");
    expect(result.state.players.find((p) => p.id === "p2")!.playedCards.some((c) => c.id === gilet.id)).toBe(false);
    expect(result.state.discardPile.map((c) => c.id)).toContain(gilet.id);
  });

  it("la rotation suit ensuite le sens inversé (Patate chaude / tours normaux)", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    const gilet = makeGiletCard();
    state = startGame(state, [gilet, ...makeDeck(20)]);
    state = processEvent(state, {
      type: "CARD_PLAYED",
      playerId: "p1",
      cardId: gilet.id,
      targetPlayerId: "p2",
      timestamp: 3,
    }).state;
    state = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 4 }).state;
    expect(state.currentPlayerId).toBe("p3");

    // Depuis p3, en sens inversé, le prochain est p2 (pas p1).
    const result = processEvent(state, { type: "TURN_ENDED", playerId: "p3", timestamp: 5 });
    expect(result.state.currentPlayerId).toBe("p2");
  });

  it("sans Gilet jaune en jeu, la rotation reste dans le sens normal", () => {
    let state = setupPlayers([["p1", "Alice"], ["p2", "Bob"], ["p3", "Carol"]]);
    state = startGame(state, makeDeck(20));

    const result = processEvent(state, { type: "TURN_ENDED", playerId: "p1", timestamp: 3 });
    expect(result.state.currentPlayerId).toBe("p2");
    expect(result.state.turnDirection).toBe(1);
  });
});
