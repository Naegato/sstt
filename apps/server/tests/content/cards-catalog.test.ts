import { describe, expect, it } from "bun:test";
import { loadPlayableDeck } from "../../src/content/cards-catalog.js";

describe("loadPlayableDeck", () => {
  it("charge les cartes normale + étoile du vrai catalogue (pas les cartes Chaos/vierges)", async () => {
    const deck = await loadPlayableDeck();

    expect(deck.length).toBe(73); // 56 normale + 17 étoile (voir assets/cards/cards.csv)
    expect(deck.every((c) => c.rarity === "normale" || c.rarity === "etoile")).toBe(true);
    expect(deck.some((c) => c.rarity === "etoile")).toBe(true);
  });

  it("branche l'effet automatisé ELIMINATE_SELF sur la carte \"J'ai perdu\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "J'ai perdu");

    expect(card).toBeDefined();
    expect(card?.effects).toEqual([{ type: "ELIMINATE_SELF" }]);
  });

  it("branche ADD_POINTS sur toutes les variantes de \"Points\"", async () => {
    const deck = await loadPlayableDeck();
    const pointsCards = deck.filter((c) => c.name === "Points");

    expect(pointsCards.length).toBe(3);
    for (const card of pointsCards) {
      expect(card.effects).toEqual([{ type: "ADD_POINTS", amount: 8 }]);
    }
  });

  it("branche ADD_POINTS + SET_POINTS_TO_WIN sur \"Super Points\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Super Points");

    expect(card?.effects).toEqual([
      { type: "SET_POINTS_TO_WIN", value: 100 },
      { type: "ADD_POINTS", amount: 90 },
    ]);
  });

  it("branche PLAY_AGAIN + CHECK_BOARD_ELIMINATION sur toutes les \"Bombe\" (normale + étoile)", async () => {
    const deck = await loadPlayableDeck();
    const bombes = deck.filter((c) => c.name === "Bombe");

    expect(bombes.length).toBe(6); // 5 normale + 1 étoile
    for (const card of bombes) {
      expect(card.effects).toEqual([
        { type: "PLAY_AGAIN" },
        { type: "CHECK_BOARD_ELIMINATION", cardName: "Bombe", threshold: 4 },
      ]);
    }
  });

  it("laisse les cartes non couvertes sans effet (résolution manuelle par les joueurs)", async () => {
    const deck = await loadPlayableDeck();
    const toi = deck.find((c) => c.name === "Toi");

    expect(toi).toBeDefined();
    expect(toi?.effects).toHaveLength(0);
    expect(toi?.text.length).toBeGreaterThan(0);
  });

  it("branche PLACE_IN_FRONT_OF_TARGET + ELIMINATE_AT_END_OF_TURN_IF_PRESENT sur les 4 cartes danger", async () => {
    const deck = await loadPlayableDeck();
    for (const name of ["Dragon", "Laser", "Trou noir", "Pluie de flèches"]) {
      const card = deck.find((c) => c.name === name);
      expect(card?.effects).toEqual([
        { type: "PLACE_IN_FRONT_OF_TARGET" },
        { type: "ELIMINATE_AT_END_OF_TURN_IF_PRESENT" },
      ]);
    }
  });

  it("branche REDIRECT_NAMED_CARD_OR_DRAW sur les 4 contre-cartes", async () => {
    const deck = await loadPlayableDeck();

    expect(deck.find((c) => c.name === "Bouclier")?.effects).toEqual([
      { type: "REDIRECT_NAMED_CARD_OR_DRAW", matchNames: ["Dragon", "Pluie de flèches"], drawCountIfNone: 2 },
    ]);
    expect(deck.find((c) => c.name === "Science")?.effects).toEqual([
      { type: "REDIRECT_NAMED_CARD_OR_DRAW", matchNames: ["Dragon", "Trou noir"], drawCountIfNone: 2 },
    ]);
    expect(deck.find((c) => c.name === "Vaisseau spatial")?.effects).toEqual([
      { type: "REDIRECT_NAMED_CARD_OR_DRAW", matchNames: ["Laser", "Trou noir"], drawCountIfNone: 2 },
    ]);
    expect(deck.find((c) => c.name === "Supervitesse")?.effects).toEqual([
      { type: "REDIRECT_NAMED_CARD_OR_DRAW", matchNames: ["Laser", "Pluie de flèches"], drawCountIfNone: 2 },
    ]);
  });

  it("donne un id unique à chaque carte, y compris pour les doublons (ex: 6 Bombes)", async () => {
    const deck = await loadPlayableDeck();
    const ids = deck.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("branche WIN_IF_ALIVE_COUNT sur \"Conclusion dramatique\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Conclusion dramatique");
    expect(card?.effects).toEqual([{ type: "WIN_IF_ALIVE_COUNT", count: 2 }]);
  });

  it("branche PLACE_IN_FRONT_OF_TARGET + SKIP_OWN_NEXT_TURNS sur \"Réforme des retraites\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Réforme des retraites");
    expect(card?.effects).toEqual([
      { type: "PLACE_IN_FRONT_OF_TARGET" },
      { type: "SKIP_OWN_NEXT_TURNS", count: 2 },
    ]);
  });

  it("distingue les 3 variantes de \"Cadeaux\" (vides/chatons/serpents) via leur texte", async () => {
    const deck = await loadPlayableDeck();
    const cadeaux = deck.filter((c) => c.name === "Cadeaux");
    expect(cadeaux.length).toBe(3);

    const vides = cadeaux.find((c) => c.text.includes("vides"));
    const chatons = cadeaux.find((c) => c.text.includes("chatons"));
    const serpents = cadeaux.find((c) => c.text.includes("serpents"));

    expect(vides?.effects).toEqual([{ type: "START_SIMULTANEOUS_VOTE", onYes: "LOSE_CARD", onNo: "NOTHING" }]);
    expect(chatons?.effects).toEqual([{ type: "START_SIMULTANEOUS_VOTE", onYes: "NOTHING", onNo: "ELIMINATE" }]);
    expect(serpents?.effects).toEqual([{ type: "START_SIMULTANEOUS_VOTE", onYes: "ELIMINATE", onNo: "NOTHING" }]);
  });

  it("branche DRAW_CARDS + PLAY_AGAIN sur \"Tricheur\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Tricheur");
    expect(card?.effects).toEqual([{ type: "DRAW_CARDS", count: 2 }, { type: "PLAY_AGAIN" }]);
  });

  it("branche DRAW_CARDS + GIVE_CARDS_TO_TARGET sur \"Quatre à la suite\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Quatre à la suite");
    expect(card?.effects).toEqual([{ type: "DRAW_CARDS", count: 4 }, { type: "GIVE_CARDS_TO_TARGET", count: 2 }]);
  });

  it("branche REACT_TO_OWN_ELIMINATION sur \"Vie supplémentaire\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Vie supplémentaire");
    expect(card?.effects).toEqual([{ type: "REACT_TO_OWN_ELIMINATION" }]);
  });

  it("branche START_MAJORITY_VOTE_CAKE_OR_GRAVE sur \"Gâteau ou Tombeau\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Gâteau ou Tombeau");
    expect(card?.effects).toEqual([{ type: "START_MAJORITY_VOTE_CAKE_OR_GRAVE" }]);
  });

  it("branche START_MAJORITY_VOTE_DEATH_OR_TCHI sur \"La mort ou Tchi-tchi ?\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "La mort ou Tchi-tchi ?");
    expect(card?.effects).toEqual([{ type: "START_MAJORITY_VOTE_DEATH_OR_TCHI" }]);
  });

  it("branche REACT_TO_GROUP_ELIMINATION sur \"Gros nul !\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Gros nul !");
    expect(card?.effects).toEqual([{ type: "REACT_TO_GROUP_ELIMINATION" }]);
  });

  it("branche DRAW_CARDS + CANCEL_LAST_PLAYED_CARD sur \"Embuscade de chatons\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Embuscade de chatons");
    expect(card?.effects).toEqual([{ type: "DRAW_CARDS", count: 3 }, { type: "CANCEL_LAST_PLAYED_CARD" }]);
  });

  it("branche DRAW_ON_ANY_ELIMINATION sur \"Rire démoniaque\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Rire démoniaque");
    expect(card?.effects).toEqual([{ type: "DRAW_ON_ANY_ELIMINATION" }]);
  });

  it("branche WIN_ALL_ALIVE_PLAYERS sur \"Câlin de groupe\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Câlin de groupe");
    expect(card?.effects).toEqual([{ type: "WIN_ALL_ALIVE_PLAYERS" }]);
  });

  it("branche LOCK_DRAW_PILE sur \"Pioche verrouillée !\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Pioche verrouillée !");
    expect(card?.effects).toEqual([{ type: "LOCK_DRAW_PILE" }]);
  });

  it("branche STEAL_ON_TURN_START sur \"Pingouins\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Pingouins");
    expect(card?.effects).toEqual([{ type: "STEAL_ON_TURN_START" }]);
  });

  it("branche PLACE_IN_FRONT_OF_TARGET + MUST_PASS_BEFORE_PLAYING sur \"Patate chaude\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Patate chaude");
    expect(card?.effects).toEqual([{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "MUST_PASS_BEFORE_PLAYING" }]);
  });

  it("branche BLOCK_INCOMING_PLACEMENT sur \"Dinosaure\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Dinosaure");
    expect(card?.effects).toEqual([{ type: "BLOCK_INCOMING_PLACEMENT" }]);
  });

  it("branche RESHUFFLE_ALL_HANDS_AND_REDRAW + PLAY_AGAIN + DISCARD_SELF sur \"Politique\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Politique");
    expect(card?.effects).toEqual([
      { type: "RESHUFFLE_ALL_HANDS_AND_REDRAW", count: 2 },
      { type: "PLAY_AGAIN" },
      { type: "DISCARD_SELF" },
    ]);
  });

  it("branche REACT_TO_OTHER_PLAYER_VICTORY sur \"Enfoiré !\" (2 exemplaires)", async () => {
    const deck = await loadPlayableDeck();
    const cards = deck.filter((c) => c.name === "Enfoiré !");
    expect(cards.length).toBe(2);
    for (const card of cards) {
      expect(card.effects).toEqual([{ type: "REACT_TO_OTHER_PLAYER_VICTORY" }]);
    }
  });

  it("branche SCHEDULE_ELIMINATE_ALL_NEXT_TURN_END sur \"Finito\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Finito");
    expect(card?.effects).toEqual([{ type: "SCHEDULE_ELIMINATE_ALL_NEXT_TURN_END" }]);
  });

  it("branche STEAL_RANDOM_CARD_AND_FORCE_PLAY sur \"Ninjas\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Ninjas");
    expect(card?.effects).toEqual([{ type: "STEAL_RANDOM_CARD_AND_FORCE_PLAY" }]);
  });

  it("branche REVEAL_BOMBS_AND_WIN_IF_ENOUGH sur \"Foire aux bombes\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Foire aux bombes");
    expect(card?.effects).toEqual([{ type: "REVEAL_BOMBS_AND_WIN_IF_ENOUGH", threshold: 4 }]);
  });

  it("branche PLACE_IN_FRONT_OF_TARGET + REVERSE_DIRECTION_AND_SKIP_IF_PRESENT sur \"Gilet jaune\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Gilet jaune");
    expect(card?.effects).toEqual([
      { type: "PLACE_IN_FRONT_OF_TARGET" },
      { type: "REVERSE_DIRECTION_AND_SKIP_IF_PRESENT" },
    ]);
  });

  it("branche PLACE_IN_FRONT_OF_TARGET + ADD_POINTS + FORCE_RANDOM_CARD_EACH_TURN sur \"Illumination ludique\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Illumination ludique");
    expect(card?.effects).toEqual([
      { type: "PLACE_IN_FRONT_OF_TARGET" },
      { type: "ADD_POINTS", amount: 2 },
      { type: "FORCE_RANDOM_CARD_EACH_TURN" },
    ]);
  });

  it("branche START_ROCK_PAPER_SCISSORS sur \"Bataille\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Bataille");
    expect(card?.effects).toEqual([{ type: "START_ROCK_PAPER_SCISSORS" }]);
  });

  it("branche START_FINGER_COUNT_CHALLENGE sur \"Chiffre\"", async () => {
    const deck = await loadPlayableDeck();
    const card = deck.find((c) => c.name === "Chiffre");
    expect(card?.effects).toEqual([{ type: "START_FINGER_COUNT_CHALLENGE" }]);
  });

  it("branche START_NOSE_COUNTDOWN sur \"Nez à nez\" et \"Pied de nez\"", async () => {
    const deck = await loadPlayableDeck();
    const nezANez = deck.find((c) => c.name === "Nez à nez");
    const piedDeNez = deck.find((c) => c.name === "Pied de nez");
    expect(nezANez?.effects).toEqual([{ type: "START_NOSE_COUNTDOWN", seconds: 3, eliminateIfTouching: false }]);
    expect(piedDeNez?.effects).toEqual([{ type: "START_NOSE_COUNTDOWN", seconds: 4, eliminateIfTouching: true }]);
  });
});
