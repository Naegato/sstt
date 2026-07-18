import type { Card, GameState, PlayerId, VoteChoice } from "@card-game/shared-types";
import { createInitialState, processEvent } from "../../src/engine/index.js";

export function makeCard(overrides: Partial<Card> & Pick<Card, "id">): Card {
  return {
    name: overrides.id,
    rarity: "normale",
    text: "Carte de test.",
    effects: [],
    ...overrides,
  };
}

/** Deck déterministe de N cartes simples, pour les tests (pas d'effet automatisé). */
export function makeDeck(count: number): Card[] {
  return Array.from({ length: count }, (_, i) => makeCard({ id: `card-${i}` }));
}

/**
 * Crée une room "room-1" et y fait rejoindre chaque joueur, dans l'ordre donné
 * (= ordre de tour). Remplace le boilerplate `createInitialState` + boucle
 * `PLAYER_JOINED` répété dans quasi tous les tests moteur.
 */
export function setupPlayers(playerNames: [id: PlayerId, name: string][]): GameState {
  let state = createInitialState("room-1");
  for (const [id, name] of playerNames) {
    state = processEvent(state, { type: "PLAYER_JOINED", playerId: id, playerName: name, timestamp: 1 }).state;
  }
  return state;
}

/** Démarre la partie avec le deck donné (`GAME_STARTED`). */
export function startGame(state: GameState, deck: Card[]): GameState {
  return processEvent(state, { type: "GAME_STARTED", timestamp: 2, deck }).state;
}

/**
 * Fait voter TOUS les joueurs éligibles du vote en cours d'un coup, via une map
 * `{playerId: choix}`. Lève une erreur explicite si un votant éligible est
 * oublié dans `choices` — cette classe de bug (voter oublié -> vote qui ne se
 * résout jamais) s'est produite plusieurs fois en écrivant les tests à la main.
 */
export function castAllVotes(state: GameState, choices: Partial<Record<PlayerId, VoteChoice>>): GameState {
  const pendingVote = state.pendingVote;
  if (!pendingVote) {
    throw new Error("castAllVotes: aucun vote en cours dans cet état");
  }
  let next = state;
  for (const playerId of pendingVote.eligiblePlayerIds) {
    const choice = choices[playerId];
    if (!choice) {
      throw new Error(`castAllVotes: choix manquant pour le votant éligible "${playerId}"`);
    }
    next = processEvent(next, { type: "VOTE_CAST", playerId, choice, timestamp: 1 }).state;
  }
  return next;
}
