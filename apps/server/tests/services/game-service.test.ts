import { describe, expect, it } from "bun:test";
import { GameService } from "../../src/services/game-service.js";
import { RoomManager } from "../../src/services/room-manager.js";

function makeService() {
  const roomManager = new RoomManager();
  return { roomManager, gameService: new GameService(roomManager) };
}

describe("GameService", () => {
  it("applique un event au moteur, met à jour la room et journalise l'event", () => {
    const { roomManager, gameService } = makeService();

    const result = gameService.handleEvent("room-1", {
      type: "PLAYER_JOINED",
      playerId: "p1",
      playerName: "Alice",
      timestamp: 1,
    });

    expect(result.state.players).toHaveLength(1);
    expect(roomManager.getRoom("room-1")?.state.players).toHaveLength(1);
    expect(gameService.getEventLog("room-1")).toHaveLength(1);
  });

  it("startGame distribue les mains via un deck mélangé au préalable (déterminisme du moteur préservé)", async () => {
    const { gameService } = makeService();

    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 });
    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 });

    const result = await gameService.startGame("room-1");

    expect(result.state.phase).toBe("playing");
    // Le premier joueur pioche automatiquement dès le début de son tour (règle officielle).
    const current = result.state.players.find((p) => p.id === result.state.currentPlayerId)!;
    const others = result.state.players.filter((p) => p.id !== result.state.currentPlayerId);
    expect(current.hand.length).toBe(3);
    expect(others.every((p) => p.hand.length === 2)).toBe(true);

    const startedEvent = gameService.getEventLog("room-1").find((e) => e.type === "GAME_STARTED");
    expect(startedEvent?.type).toBe("GAME_STARTED");
    if (startedEvent?.type === "GAME_STARTED") {
      // Le deck mélangé est bien porté par l'event, pas régénéré par le moteur.
      expect(startedEvent.deck.length).toBeGreaterThan(0);
    }
  });

  it("startGame charge le vrai catalogue avec une distribution équilibrée des cartes Étoile", async () => {
    const { gameService } = makeService();
    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 });
    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 });

    await gameService.startGame("room-1");
    const startedEvent = gameService.getEventLog("room-1").find((e) => e.type === "GAME_STARTED");
    if (startedEvent?.type !== "GAME_STARTED") throw new Error("GAME_STARTED introuvable");

    const deck = startedEvent.deck;
    expect(deck.length).toBe(73); // le vrai catalogue, pas un deck de test
    expect(deck.some((c) => c.rarity === "etoile")).toBe(true);

    // Pas de longue série sans carte Étoile (déck équilibré, pas juste mélangé).
    let maxGapWithoutStar = 0;
    let sinceLastStar = 0;
    for (const card of deck) {
      if (card.rarity === "etoile") {
        maxGapWithoutStar = Math.max(maxGapWithoutStar, sinceLastStar);
        sinceLastStar = 0;
      } else {
        sinceLastStar++;
      }
    }
    expect(maxGapWithoutStar).toBeLessThan(15); // très généreux : 73/17 ≈ 4.3 en moyenne
  });

  it("endTurn fait piocher automatiquement le joueur suivant (règle : piocher puis jouer)", async () => {
    const { gameService } = makeService();
    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 });
    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 });

    const started = await gameService.startGame("room-1");
    const p1 = started.state.players.find((p) => p.id === "p1")!;
    // Le vrai catalogue peut distribuer une carte qui ouvre un vote ou exige d'être
    // éliminé (Cadeaux, Vie supplémentaire, Gros nul !...) : endTurn échouerait alors
    // légitimement (VOTE_PENDING / NOT_ELIGIBLE_FOR_REACTION), sans rapport avec ce
    // test. On ne joue que la première carte "simple" de la main, sinon on saute.
    // Inclut aussi tout effet pouvant terminer la partie tout de suite (2 joueurs
    // seulement dans ce test : "J'ai perdu" élimine l'unique adversaire restant,
    // "Conclusion dramatique"/"Câlin de groupe" gagnent immédiatement à 2 joueurs),
    // ou tout effet qui changerait la main de p2 autrement que par la pioche
    // automatique de fin de tour attendue par ce test (GIVE_CARDS_TO_TARGET), ou
    // qui l'empêcherait carrément (LOCK_DRAW_PILE).
    const blockingEffects = new Set([
      "START_SIMULTANEOUS_VOTE",
      "START_MAJORITY_VOTE_CAKE_OR_GRAVE",
      "START_MAJORITY_VOTE_DEATH_OR_TCHI",
      "START_ROCK_PAPER_SCISSORS",
      "START_FINGER_COUNT_CHALLENGE",
      "REACT_TO_OWN_ELIMINATION",
      "REACT_TO_GROUP_ELIMINATION",
      "REACT_TO_OTHER_PLAYER_VICTORY",
      "ELIMINATE_SELF",
      "WIN_IF_ALIVE_COUNT",
      "WIN_ALL_ALIVE_PLAYERS",
      "GIVE_CARDS_TO_TARGET",
      "LOCK_DRAW_PILE",
      "START_NOSE_COUNTDOWN", // ouvre pendingNoseCountdown, bloque endTurn (NOSE_COUNTDOWN_PENDING) comme les votes/choix ci-dessus
      "START_HAND_SLAP", // ouvre pendingHandSlap ("Du chocolat !"), bloque endTurn (HAND_SLAP_PENDING) de la même façon
      // Changent la main de p2 autrement que par la pioche automatique de fin de
      // tour attendue par ce test — pas bloquants pour endTurn, mais fausseraient
      // l'assertion hand.length === 3 ci-dessous (trouvé par du fuzzing manuel) :
      // "Illumination ludique" ciblant p2 le force à jouer une carte au hasard dès
      // sa prochaine pioche (juste après, dans ce test) ; "Politique" mélange et
      // redistribue toutes les mains ; "Ninjas" vole puis force la carte volée ;
      // "À moi ! À qui ?..." échange carrément les deux mains.
      "FORCE_RANDOM_CARD_EACH_TURN",
      "RESHUFFLE_ALL_HANDS_AND_REDRAW",
      "STEAL_RANDOM_CARD_AND_FORCE_PLAY",
      "SWAP_POSITION_AND_HAND",
    ]);
    const cardToPlay = p1.hand.find((c) => !c.effects.some((e) => blockingEffects.has(e.type)));
    if (!cardToPlay) return; // hand entièrement composée de cartes bloquantes, cas trop rare pour être testé ici

    // Cible toujours fournie : le vrai catalogue peut aussi distribuer une carte qui
    // en exige une (Dragon, Réforme des retraites...) — sinon MISSING_TARGET, flaky.
    gameService.playCard("room-1", "p1", cardToPlay.id, "p2");
    const result = gameService.endTurn("room-1", "p1");

    expect(result.state.currentPlayerId).toBe("p2");
    expect(result.state.players.find((p) => p.id === "p2")!.hand.length).toBe(3); // 2 de départ + pioche auto
    expect(result.sideEffects.some((e) => e.type === "CARDS_DRAWN" && e.playerId === "p2")).toBe(true);
  });

  it("playCard repioche automatiquement pour le même joueur quand la carte accorde PLAY_AGAIN", async () => {
    const { gameService, roomManager } = makeService();
    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 });
    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 });
    await gameService.startGame("room-1");

    // Injecte directement une carte "rejouez un tour" dans la main de p1 (contourne le tirage aléatoire réel).
    const bombe = { id: "bombe-test", name: "Bombe", rarity: "normale" as const, text: "", effects: [{ type: "PLAY_AGAIN" as const }] };
    const room = roomManager.getRoom("room-1")!;
    room.state = {
      ...room.state,
      players: room.state.players.map((p) => (p.id === "p1" ? { ...p, hand: [...p.hand, bombe] } : p)),
    };

    const handBefore = roomManager.getRoom("room-1")!.state.players.find((p) => p.id === "p1")!.hand.length;
    const result = gameService.playCard("room-1", "p1", bombe.id);

    expect(result.state.currentPlayerId).toBe("p1"); // tour pas avancé
    expect(result.state.players.find((p) => p.id === "p1")!.hand.length).toBe(handBefore - 1 + 1); // -1 jouée +1 repiochée
    expect(result.sideEffects.some((e) => e.type === "PLAY_AGAIN_GRANTED")).toBe(true);
    expect(result.sideEffects.filter((e) => e.type === "CARDS_DRAWN")).toHaveLength(1);
  });

  it("\"Illumination ludique\" force le porteur à jouer 1 carte au hasard à chaque tour (pas de choix)", async () => {
    const { gameService, roomManager } = makeService();
    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 });
    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 2 });
    await gameService.startGame("room-1");

    const illumination = {
      id: "illum-test",
      name: "Illumination ludique",
      rarity: "etoile" as const,
      text: "",
      effects: [{ type: "FORCE_RANDOM_CARD_EACH_TURN" as const }],
    };
    const filler = { id: "filler-1", name: "Zombies", rarity: "normale" as const, text: "", effects: [] };
    const harmless = { id: "harmless-1", name: "Zombies", rarity: "normale" as const, text: "", effects: [] };

    // p1 est le joueur courant après startGame (premier joueur de la room).
    // On lui pose Illumination ludique et on vide sa main : à la prochaine
    // pioche de son tour, il n'aura donc qu'1 seule carte possible (harmless),
    // ce qui rend le tirage "au hasard" déterministe pour ce test. Pioche
    // contrôlée : [filler pour p2, harmless pour p1 ensuite, ...].
    const room = roomManager.getRoom("room-1")!;
    room.state = {
      ...room.state,
      players: room.state.players.map((p) =>
        p.id === "p1" ? { ...p, playedCards: [...p.playedCards, illumination], hand: [] } : p,
      ),
      drawPile: [filler, harmless, ...room.state.drawPile],
    };

    gameService.endTurn("room-1", "p1"); // -> p2, pioche filler pour p2
    gameService.endTurn("room-1", "p2"); // -> p1, pioche harmless pour p1 -> Illumination ludique force son jeu

    const p1 = roomManager.getRoom("room-1")!.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand.some((c) => c.id === "harmless-1")).toBe(false);
    expect(p1.playedCards.some((c) => c.id === "harmless-1")).toBe(true);
  });

  it("garde des rooms indépendantes entre elles", () => {
    const { gameService } = makeService();

    gameService.handleEvent("room-1", { type: "PLAYER_JOINED", playerId: "p1", playerName: "Alice", timestamp: 1 });
    gameService.handleEvent("room-2", { type: "PLAYER_JOINED", playerId: "p2", playerName: "Bob", timestamp: 1 });

    expect(gameService.getEventLog("room-1")).toHaveLength(1);
    expect(gameService.getEventLog("room-2")).toHaveLength(1);
  });
});
