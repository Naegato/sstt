import type { Card, CardId, GameState, Player, PlayerId, RoomId, VoteChoice, VoteOutcome } from "@card-game/shared-types";
import { STARTING_HAND_SIZE, WINNING_POINTS } from "@card-game/shared-types";
import { GameLogicError } from "./errors.js";
import type { EngineResult, SideEffect } from "./types.js";

export function createInitialState(roomId: RoomId): GameState {
  return {
    roomId,
    phase: "lobby",
    players: [],
    currentPlayerId: null,
    drawPile: [],
    discardPile: [],
    winnerIds: null,
    pointsToWin: WINNING_POINTS,
    pendingVote: null,
    lastEliminationBatch: null,
    lastPlayedCard: null,
    stolenThisTurn: false,
    hasPlayedThisTurn: false,
    pendingFinito: null,
    turnDirection: 1,
    pendingChoice: null,
    openReflexCardId: null,
    pendingNoseCountdown: null,
    pendingHandSlap: null,
  };
}

/**
 * "Rejouer une partie" : remet la room en lobby en conservant les MÊMES
 * joueurs (id/nom), tout le reste réinitialisé comme `createInitialState` —
 * mains, cartes posées, points, élimination, etc. Contrairement à un simple
 * `createInitialState`, ne perd pas la liste des joueurs déjà connectés (ils
 * n'auraient sinon aucun moyen de "rejoindre" une room déjà repartie de zéro
 * sans re-déclencher PLAYER_JOINED côté client).
 */
export function resetGameToLobby(state: GameState): GameState {
  return {
    ...createInitialState(state.roomId),
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      hand: [],
      playedCards: [],
      isEliminated: false,
      points: 0,
      skipTurns: 0,
    })),
  };
}

export function findPlayer(state: GameState, playerId: PlayerId): Player {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new GameLogicError(`Joueur ${playerId} introuvable`, "PLAYER_NOT_FOUND", { playerId });
  }
  return player;
}

/** Remplace un joueur par sa version mise à jour (immuable). */
export function updatePlayer(state: GameState, playerId: PlayerId, update: (player: Player) => Player): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? update(p) : p)),
  };
}

export function addPlayer(state: GameState, playerId: PlayerId, name: string): GameState {
  // Idempotent : un même playerId qui rejoint deux fois (refresh, double-clic,
  // reconnexion) ne doit jamais créer une seconde entrée dupliquée dans players.
  if (state.players.some((p) => p.id === playerId)) {
    return state;
  }

  if (state.phase !== "lobby") {
    throw new GameLogicError("Impossible de rejoindre une partie déjà commencée", "GAME_ALREADY_STARTED", {
      phase: state.phase,
    });
  }
  const newPlayer: Player = {
    id: playerId,
    name,
    hand: [],
    playedCards: [],
    isEliminated: false,
    points: 0,
    skipTurns: 0,
  };
  return { ...state, players: [...state.players, newPlayer] };
}

/** Distribue la main de départ à chaque joueur depuis le deck déjà mélangé (voir GameStartedEvent). */
export function startGame(state: GameState, deck: Card[]): GameState {
  let remainingDeck = deck;
  const players = state.players.map((player) => {
    const hand = remainingDeck.slice(0, STARTING_HAND_SIZE);
    remainingDeck = remainingDeck.slice(STARTING_HAND_SIZE);
    return { ...player, hand };
  });

  return {
    ...state,
    phase: "playing",
    players,
    currentPlayerId: players[0]?.id ?? null,
    drawPile: remainingDeck,
  };
}

/** Vrai si "Pioche verrouillée !" (LOCK_DRAW_PILE) est posée devant un joueur — bloque toute pioche, toutes sources confondues. */
export function isDrawPileLocked(state: GameState): boolean {
  return state.players.some((p) => p.playedCards.some((c) => c.effects.some((e) => e.type === "LOCK_DRAW_PILE")));
}

/** Vrai si "Dinosaure" (BLOCK_INCOMING_PLACEMENT) est posée devant `playerId` — protège contre un placement direct ciblé par un autre joueur. */
export function isProtectedByDinosaur(state: GameState, playerId: PlayerId): boolean {
  const player = state.players.find((p) => p.id === playerId);
  return player?.playedCards.some((c) => c.effects.some((e) => e.type === "BLOCK_INCOMING_PLACEMENT")) ?? false;
}

export function drawCards(state: GameState, playerId: PlayerId, count: number): EngineResult {
  if (isDrawPileLocked(state)) {
    return { state, sideEffects: [{ type: "CARDS_DRAWN", playerId, count: 0 }] };
  }

  const actualCount = Math.min(count, state.drawPile.length);
  const drawnCards = state.drawPile.slice(0, actualCount);
  const remainingDrawPile = state.drawPile.slice(actualCount);

  const next = updatePlayer(
    { ...state, drawPile: remainingDrawPile },
    playerId,
    (p) => ({ ...p, hand: [...p.hand, ...drawnCards] }),
  );

  const sideEffects: SideEffect[] = [{ type: "CARDS_DRAWN", playerId, count: actualCount }];
  return { state: next, sideEffects };
}

/**
 * "Politique" : vide toutes les mains, remplace la pioche par `shuffledOrder`
 * (déjà mélangé côté service — le moteur pur ne mélange jamais lui-même), puis
 * fait piocher `count` cartes à chaque joueur. Réutilise `drawCards()` pour
 * chaque joueur, donc respecte automatiquement "Pioche verrouillée !" si elle
 * est en jeu (0 carte distribuée dans ce cas, sans code dédié).
 */
export function reshuffleAllHandsAndRedraw(state: GameState, shuffledOrder: Card[], count: number): EngineResult {
  let next: GameState = {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: [] })),
    drawPile: shuffledOrder,
  };
  const sideEffects: SideEffect[] = [{ type: "HANDS_RESHUFFLED" }];

  for (const player of state.players) {
    const drawResult = drawCards(next, player.id, count);
    next = drawResult.state;
    sideEffects.push(...drawResult.sideEffects);
  }

  return { state: next, sideEffects };
}

/**
 * Élimine un joueur puis vérifie la condition de victoire : dernier joueur non
 * éliminé gagne la partie (règle officielle).
 */
export function eliminatePlayer(state: GameState, playerId: PlayerId, checkWin = true): EngineResult {
  let next = updatePlayer(state, playerId, (p) => ({ ...p, isEliminated: true }));
  const sideEffects: SideEffect[] = [{ type: "PLAYER_ELIMINATED", playerId }];

  if (checkWin) {
    const alive = next.players.filter((p) => !p.isEliminated);
    if (alive.length <= 1) {
      const winnerIds = alive.length === 1 ? [alive[0]!.id] : null;
      next = { ...next, phase: "ended", winnerIds };
      if (winnerIds) {
        sideEffects.push({ type: "GAME_WON", winnerIds });
      }
    }
  }

  return { state: next, sideEffects };
}

/**
 * Élimine tous les joueurs encore en jeu d'un coup (ex: explosion de bombes) —
 * ne passe PAS par `eliminatePlayer` un par un, pour éviter qu'une victoire soit
 * déclarée à tort sur l'avant-dernier joueur éliminé de la salve.
 */
export function eliminateAllAlivePlayers(state: GameState): EngineResult {
  const alive = state.players.filter((p) => !p.isEliminated);
  const next: GameState = {
    ...state,
    players: state.players.map((p) => (p.isEliminated ? p : { ...p, isEliminated: true })),
    phase: "ended",
    winnerIds: null,
  };
  const sideEffects: SideEffect[] = alive.map((p) => ({ type: "PLAYER_ELIMINATED", playerId: p.id }));
  return { state: next, sideEffects };
}

/**
 * Élimine un sous-ensemble de joueurs (ex: ceux qui ont mal voté) en une seule
 * fois, avec un unique check de victoire à la fin — évite qu'une victoire soit
 * déclarée à tort au milieu de la salve si on éliminait un par un.
 */
export function eliminateSpecificPlayers(state: GameState, playerIds: PlayerId[]): EngineResult {
  const idsToEliminate = new Set(playerIds);
  if (idsToEliminate.size === 0) {
    return { state, sideEffects: [] };
  }

  const newlyEliminatedIds = state.players.filter((p) => idsToEliminate.has(p.id) && !p.isEliminated).map((p) => p.id);
  let next: GameState = {
    ...state,
    players: state.players.map((p) => (idsToEliminate.has(p.id) && !p.isEliminated ? { ...p, isEliminated: true } : p)),
    lastEliminationBatch: null,
  };
  const sideEffects: SideEffect[] = newlyEliminatedIds.map((id) => ({ type: "PLAYER_ELIMINATED", playerId: id }));

  const alive = next.players.filter((p) => !p.isEliminated);
  if (alive.length <= 1) {
    const winnerIds = alive.length === 1 ? [alive[0]!.id] : null;
    next = { ...next, phase: "ended", winnerIds };
    if (winnerIds) {
      sideEffects.push({ type: "GAME_WON", winnerIds });
    }
  } else if (newlyEliminatedIds.length >= 2) {
    // Ouvre la fenêtre de réaction "Gros nul !" (voir REACT_TO_GROUP_ELIMINATION) —
    // uniquement quand la partie continue (sinon plus personne pour réagir).
    next = { ...next, lastEliminationBatch: newlyEliminatedIds };
  }

  return { state: next, sideEffects };
}

/** Ferme la fenêtre de dénonciation d'une carte réflexe instantanée (voir `GameState.openReflexCardId`), à la fin du tour. */
export function clearOpenReflexWindow(state: GameState): GameState {
  if (state.openReflexCardId === null) return state;
  return { ...state, openReflexCardId: null };
}

/** Ferme la fenêtre de réaction "Gros nul !" (voir REACT_TO_GROUP_ELIMINATION dans cards.ts). */
export function clearEliminationBatch(state: GameState): GameState {
  if (state.lastEliminationBatch === null) return state;
  return { ...state, lastEliminationBatch: null };
}

/**
 * Résout "Embuscade de chatons" jouée en interruption : retire de la table la
 * carte visée par `state.lastPlayedCard` (annulation + défausse) et fait piocher
 * 1 carte à l'interrupteur. N'annule PAS les effets déjà appliqués par la carte
 * visée (voir limite documentée sur CANCEL_LAST_PLAYED_CARD) — si la carte a
 * entre-temps été déplacée/retirée de sa pile d'origine (ex: redirigée par un
 * Bouclier), il n'y a simplement plus rien à annuler.
 */
export function cancelLastPlayedCard(state: GameState, interrupterId: PlayerId): EngineResult {
  const target = state.lastPlayedCard;
  if (!target) {
    throw new GameLogicError("Aucune carte n'a encore été jouée, rien à annuler", "NO_CARD_TO_CANCEL", {
      playerId: interrupterId,
    });
  }

  const holder = state.players.find((p) => p.id === target.holderId);
  const cardIndex = holder?.playedCards.findIndex((c) => c.id === target.cardId) ?? -1;
  if (!holder || cardIndex === -1) {
    return { state, sideEffects: [] };
  }

  const cancelledCard = holder.playedCards[cardIndex]!;
  let next = updatePlayer(state, holder.id, (p) => ({
    ...p,
    playedCards: p.playedCards.filter((_, i) => i !== cardIndex),
  }));
  next = { ...next, discardPile: [...next.discardPile, cancelledCard] };

  const drawResult = drawCards(next, interrupterId, 1);
  return {
    state: drawResult.state,
    sideEffects: [
      { type: "PLAYED_CARD_CANCELLED", playerId: holder.id, cardId: cancelledCard.id },
      ...drawResult.sideEffects,
    ],
  };
}

/**
 * Résout "Gros nul !" : parmi le groupe éliminé ensemble, seul `chosenPlayerId`
 * reste éliminé, tous les autres membres du groupe sont réintégrés.
 */
export function reactToGroupElimination(state: GameState, chosenPlayerId: PlayerId): EngineResult {
  const batch = state.lastEliminationBatch ?? [];
  const revivedIds = batch.filter((id) => id !== chosenPlayerId);

  const next: GameState = {
    ...state,
    players: state.players.map((p) => (revivedIds.includes(p.id) ? { ...p, isEliminated: false } : p)),
    lastEliminationBatch: null,
  };
  const sideEffects: SideEffect[] = revivedIds.map((id) => ({ type: "ELIMINATION_REVERSED", playerId: id }));

  return { state: next, sideEffects };
}

/**
 * Résout l'action optionnelle "Pingouins" (STEAL_ON_TURN_START) : le joueur
 * courant vole `cardId` dans la pile de `targetPlayerId`, au plus 1 fois par
 * tour. Vérifie l'éligibilité (c'est son tour, il porte bien Pingouins en jeu,
 * pas encore volé ce tour-ci, cible différente de lui-même, carte bien présente
 * chez la cible) avant de déplacer la carte.
 */
export function stealPlayedCard(
  state: GameState,
  playerId: PlayerId,
  targetPlayerId: PlayerId,
  cardId: string,
): EngineResult {
  if (state.currentPlayerId !== playerId) {
    throw new GameLogicError("Ce n'est pas le tour de ce joueur", "NOT_YOUR_TURN", {
      playerId,
      currentPlayerId: state.currentPlayerId,
    });
  }
  const player = findPlayer(state, playerId);
  const hasPingouins = player.playedCards.some((c) => c.effects.some((e) => e.type === "STEAL_ON_TURN_START"));
  if (!hasPingouins) {
    throw new GameLogicError("Ce joueur n'a pas Pingouins en jeu", "NOT_ELIGIBLE_TO_STEAL", { playerId });
  }
  if (state.stolenThisTurn) {
    throw new GameLogicError("Le vol de Pingouins a déjà été utilisé ce tour-ci", "ALREADY_STOLEN_THIS_TURN", {
      playerId,
    });
  }
  if (targetPlayerId === playerId) {
    throw new GameLogicError("Impossible de se voler soi-même", "INVALID_STEAL_TARGET", { playerId, targetPlayerId });
  }

  const target = findPlayer(state, targetPlayerId);
  const cardIndex = target.playedCards.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    throw new GameLogicError("Cette carte n'est pas dans la pile de ce joueur", "CARD_NOT_IN_PLAYED_CARDS", {
      targetPlayerId,
      cardId,
    });
  }

  const stolenCard = target.playedCards[cardIndex]!;
  let next = updatePlayer(state, targetPlayerId, (p) => ({
    ...p,
    playedCards: p.playedCards.filter((_, i) => i !== cardIndex),
  }));
  next = updatePlayer(next, playerId, (p) => ({ ...p, playedCards: [...p.playedCards, stolenCard] }));
  next = { ...next, stolenThisTurn: true };

  return {
    state: next,
    sideEffects: [{ type: "PLAYED_CARD_STOLEN", playerId, targetPlayerId, cardId: stolenCard.id }],
  };
}

/**
 * Prochain joueur encore en jeu dans l'ordre de la table à partir de `playerId`
 * (exclu), en tournant dans `state.turnDirection` (voir "Gilet jaune") — "le
 * joueur à sa gauche" pour Patate chaude. `null` s'il n'y a personne d'autre en jeu.
 */
export function findNextAlivePlayer(state: GameState, playerId: PlayerId): PlayerId | null {
  const order = state.players;
  const startIndex = order.findIndex((p) => p.id === playerId);
  if (startIndex === -1) return null;

  for (let offset = 1; offset <= order.length; offset++) {
    const rawIndex = startIndex + offset * state.turnDirection;
    const candidate = order[((rawIndex % order.length) + order.length) % order.length];
    if (candidate && !candidate.isEliminated && candidate.id !== playerId) {
      return candidate.id;
    }
  }
  return null;
}

/**
 * Résout "Enfoiré !" : élimine le vainqueur désigné par `state.winnerIds[0]`
 * ET le joueur qui réagit. Si ≥2 joueurs restent en jeu après ça, rouvre la
 * partie (`phase` -> "playing", en avançant `currentPlayerId` s'il pointait
 * sur l'un des deux joueurs qu'on vient d'éliminer) ; sinon la termine
 * normalement (vainqueur unique restant, ou personne).
 */
export function reactToVictory(state: GameState, reactingPlayerId: PlayerId): EngineResult {
  const winnerId = state.winnerIds?.[0];
  if (!winnerId) {
    throw new GameLogicError("Aucune victoire à contester pour l'instant", "NO_VICTORY_TO_REACT_TO", {
      playerId: reactingPlayerId,
    });
  }

  const eliminatedIds = new Set([winnerId, reactingPlayerId]);
  let next: GameState = {
    ...state,
    players: state.players.map((p) => (eliminatedIds.has(p.id) ? { ...p, isEliminated: true } : p)),
  };
  const sideEffects: SideEffect[] = [...eliminatedIds].map((playerId) => ({
    type: "PLAYER_ELIMINATED" as const,
    playerId,
  }));

  const alive = next.players.filter((p) => !p.isEliminated);
  if (alive.length <= 1) {
    const winnerIds = alive.length === 1 ? [alive[0]!.id] : null;
    next = { ...next, phase: "ended", winnerIds };
    if (winnerIds) {
      sideEffects.push({ type: "GAME_WON", winnerIds });
    }
    return { state: next, sideEffects };
  }

  // La partie reprend : si le joueur courant vient d'être éliminé, on avance au suivant.
  const currentStillAlive = next.currentPlayerId
    ? !next.players.find((p) => p.id === next.currentPlayerId)?.isEliminated
    : false;
  const currentPlayerId = currentStillAlive
    ? next.currentPlayerId
    : findNextAlivePlayer(next, next.currentPlayerId ?? reactingPlayerId);

  next = { ...next, phase: "playing", winnerIds: null, currentPlayerId, stolenThisTurn: false, hasPlayedThisTurn: false };
  return { state: next, sideEffects };
}

/**
 * Résout l'action obligatoire "Patate chaude" (MUST_PASS_BEFORE_PLAYING) : le
 * joueur courant la passe au joueur suivant — pas de choix de destinataire,
 * contrairement au vol de Pingouins. S'il ne le fait pas avant de jouer une
 * carte, il est éliminé à la place (voir la vérification dans playCard()).
 */
export function passHotPotato(state: GameState, playerId: PlayerId): EngineResult {
  if (state.currentPlayerId !== playerId) {
    throw new GameLogicError("Ce n'est pas le tour de ce joueur", "NOT_YOUR_TURN", {
      playerId,
      currentPlayerId: state.currentPlayerId,
    });
  }
  const player = findPlayer(state, playerId);
  const cardIndex = player.playedCards.findIndex((c) => c.effects.some((e) => e.type === "MUST_PASS_BEFORE_PLAYING"));
  if (cardIndex === -1) {
    throw new GameLogicError("Ce joueur n'a pas la Patate chaude", "NOT_ELIGIBLE_TO_PASS", { playerId });
  }

  const targetPlayerId = findNextAlivePlayer(state, playerId);
  if (!targetPlayerId) {
    throw new GameLogicError("Aucun autre joueur à qui passer la Patate chaude", "NO_TARGET_FOR_PASS", { playerId });
  }

  const card = player.playedCards[cardIndex]!;
  let next = updatePlayer(state, playerId, (p) => ({
    ...p,
    playedCards: p.playedCards.filter((_, i) => i !== cardIndex),
  }));
  next = updatePlayer(next, targetPlayerId, (p) => ({ ...p, playedCards: [...p.playedCards, card] }));

  return {
    state: next,
    sideEffects: [{ type: "HOT_POTATO_PASSED", playerId, targetPlayerId, cardId: card.id }],
  };
}

/** Retire la première carte de la main d'un joueur et la place à la défausse commune (si sa main n'est pas vide). */
export function moveFirstHandCardToDiscard(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.find((p) => p.id === playerId);
  const card = player?.hand[0];
  if (!player || !card) {
    return state;
  }
  const withoutCard = updatePlayer(state, playerId, (p) => ({ ...p, hand: p.hand.slice(1) }));
  return { ...withoutCard, discardPile: [...withoutCard.discardPile, card] };
}

/**
 * Retire la première carte de la main de `fromPlayerId` et la donne à
 * `toPlayerId` (si `fromPlayerId` a une main non vide, sinon rien ne se
 * passe) — ex: "Cadeaux" vides ("Prenez une carte à chaque joueur qui a
 * répondu oui"), la carte prise rejoint la main de l'auteur, PAS la défausse.
 */
export function moveFirstHandCardToPlayer(state: GameState, fromPlayerId: PlayerId, toPlayerId: PlayerId): GameState {
  const fromPlayer = state.players.find((p) => p.id === fromPlayerId);
  const card = fromPlayer?.hand[0];
  if (!fromPlayer || !card) {
    return state;
  }
  let next = updatePlayer(state, fromPlayerId, (p) => ({ ...p, hand: p.hand.slice(1) }));
  next = updatePlayer(next, toPlayerId, (p) => ({ ...p, hand: [...p.hand, card] }));
  return next;
}

/**
 * "À moi ! À qui ? À moi ! À vous ?" : échange la position dans l'ordre des
 * tours ET la main entre `playerId` et `targetPlayerId` — `playedCards` de
 * chacun reste inchangé (voir `SWAP_POSITION_AND_HAND` dans shared-types pour
 * le détail de cette limite assumée). Sans effet si l'un des deux joueurs est
 * introuvable.
 */
export function swapPositionAndHand(state: GameState, playerId: PlayerId, targetPlayerId: PlayerId): GameState {
  const idxA = state.players.findIndex((p) => p.id === playerId);
  const idxB = state.players.findIndex((p) => p.id === targetPlayerId);
  if (idxA === -1 || idxB === -1) {
    return state;
  }
  const handA = state.players[idxA]!.hand;
  const handB = state.players[idxB]!.hand;
  let next = updatePlayer(state, playerId, (p) => ({ ...p, hand: handB }));
  next = updatePlayer(next, targetPlayerId, (p) => ({ ...p, hand: handA }));

  // updatePlayer() ne change jamais l'ordre du tableau (juste le contenu par id),
  // donc idxA/idxB restent valides pour échanger les deux positions elles-mêmes.
  const players = [...next.players];
  [players[idxA], players[idxB]] = [players[idxB]!, players[idxA]!];
  return { ...next, players };
}

/**
 * Ouvre un vote simultané oui/non pour tous les joueurs actuellement en jeu.
 * Bloque la fin de tour tant qu'il n'est pas résolu (voir index.ts / TURN_ENDED).
 */
export function startSimultaneousVote(
  state: GameState,
  cardId: string,
  actorPlayerId: PlayerId,
  onYes: VoteOutcome,
  onNo: VoteOutcome,
): GameState {
  const eligiblePlayerIds = state.players.filter((p) => !p.isEliminated).map((p) => p.id);
  return {
    ...state,
    pendingVote: { mode: "simultaneous", cardId, actorPlayerId, eligiblePlayerIds, votes: {}, onYes, onNo },
  };
}

/**
 * Ouvre le vote à majorité "winClaim" ("Vous avez gagné !", condition non
 * vérifiable par le serveur) : l'auteur de la carte vote ou non selon la
 * parité du nombre de joueurs en jeu, pour garantir un nombre de votants
 * TOUJOURS impair (pas de risque d'égalité stricte, demande explicite de
 * l'utilisateur) — nombre pair de joueurs -> l'auteur ne vote pas (comme
 * "Gâteau ou Tombeau", reste impair) ; nombre impair -> l'exclure laisserait
 * un nombre pair de votants, donc il vote aussi (comme "La mort ou Tchi-tchi").
 */
export function startWinClaimVote(state: GameState, cardId: CardId, actorPlayerId: PlayerId, description: string): GameState {
  const alivePlayers = state.players.filter((p) => !p.isEliminated);
  const includeActor = alivePlayers.length % 2 === 1;
  const eligiblePlayerIds = alivePlayers
    .filter((p) => includeActor || p.id !== actorPlayerId)
    .map((p) => p.id);
  return {
    ...state,
    pendingVote: { mode: "winClaim", cardId, actorPlayerId, description, eligiblePlayerIds, votes: {} },
  };
}

/** "Vous avez gagné !" (variante ≥N Bombes visibles) : compte les Bombes déjà posées sur la table, toutes piles confondues. */
export function hasEnoughBombsOnBoard(state: GameState, threshold: number): boolean {
  return countCardOnBoard(state, "Bombe") >= threshold;
}

/** "Vous avez gagné !" (variante "personne n'a de carte Étoile en main") : vérifie les mains de TOUS les joueurs, pas seulement l'auteur. */
export function noPlayerHasStarCardInHand(state: GameState): boolean {
  return state.players.every((p) => p.hand.every((c) => c.rarity !== "etoile"));
}

/**
 * Ouvre le vote à majorité "Gâteau ou Tombeau" : tous les joueurs en jeu SAUF
 * l'auteur de la carte votent (voir résolution dans `castVote`).
 */
export function startCakeOrGraveVote(state: GameState, cardId: string, actorPlayerId: PlayerId): GameState {
  const eligiblePlayerIds = state.players
    .filter((p) => !p.isEliminated && p.id !== actorPlayerId)
    .map((p) => p.id);
  return {
    ...state,
    pendingVote: { mode: "cakeOrGrave", cardId, eligiblePlayerIds, votes: {}, actorPlayerId },
  };
}

/**
 * Ouvre le vote à majorité "La mort ou Tchi-tchi" : tous les joueurs en jeu
 * votent, y compris l'auteur de la carte (voir résolution dans `castVote`).
 */
export function startDeathOrTchiVote(state: GameState, cardId: string): GameState {
  const eligiblePlayerIds = state.players.filter((p) => !p.isEliminated).map((p) => p.id);
  return {
    ...state,
    pendingVote: { mode: "deathOrTchi", cardId, eligiblePlayerIds, votes: {} },
  };
}

/**
 * Ouvre un vote de dénonciation : un joueur estime qu'un autre n'a pas
 * respecté une carte manuelle. Tous les joueurs en jeu votent SAUF le dénoncé
 * (conflit d'intérêt) — voir résolution dans `castVote`. Pas liée à une carte
 * précise, déclenchable à tout moment, sans rapport avec l'ordre des tours.
 */
export function startDenunciationVote(
  state: GameState,
  accuserId: PlayerId,
  accusedId: PlayerId,
  reason: string,
): GameState {
  if (state.pendingVote) {
    throw new GameLogicError("Un vote est déjà en cours", "VOTE_PENDING", { voteMode: state.pendingVote.mode });
  }
  const accuser = findPlayer(state, accuserId);
  const accused = findPlayer(state, accusedId);
  if (accuser.isEliminated) {
    throw new GameLogicError("Un joueur éliminé ne peut pas dénoncer quelqu'un", "NOT_ELIGIBLE_TO_DENOUNCE", {
      accuserId,
    });
  }
  if (accused.isEliminated) {
    throw new GameLogicError("Ce joueur est déjà éliminé", "INVALID_DENUNCIATION_TARGET", { accusedId });
  }

  // Tout le monde vote, y compris le dénoncé (et l'auto-dénonciation est
  // possible : accuserId peut être égal à accusedId).
  const eligiblePlayerIds = state.players.filter((p) => !p.isEliminated).map((p) => p.id);
  return {
    ...state,
    pendingVote: { mode: "denunciation", accuserId, accusedId, reason, eligiblePlayerIds, votes: {} },
  };
}

/**
 * Déclare directement le(s) vainqueur(s) (ex: égalité sur "Gâteau ou Tombeau",
 * victoire "Tchi-tchi" unique, ou victoire collective "Câlin de groupe").
 */
export function declareWinners(state: GameState, winnerIds: PlayerId[]): EngineResult {
  return {
    state: { ...state, phase: "ended", winnerIds },
    sideEffects: [{ type: "GAME_WON", winnerIds }],
  };
}

/** Ouvre "Bataille" : tous les joueurs en jeu choisissent en secret pierre/feuille/ciseaux. */
export function startRockPaperScissors(
  state: GameState,
  cardId: CardId,
  actorPlayerId: PlayerId,
  losingShape: "pierre" | "feuille" | "ciseaux" | "differentFromActor",
): GameState {
  const eligiblePlayerIds = state.players.filter((p) => !p.isEliminated).map((p) => p.id);
  return {
    ...state,
    pendingChoice: { mode: "rockPaperScissors", cardId, actorPlayerId, losingShape, eligiblePlayerIds, choices: {} },
  };
}

/** Ouvre "Chiffre" : tous les joueurs en jeu montrent en secret 1 à 5 doigts ; `actorPlayerId` gagne si la somme est première. */
export function startFingerCountChallenge(state: GameState, cardId: CardId, actorPlayerId: PlayerId): GameState {
  const eligiblePlayerIds = state.players.filter((p) => !p.isEliminated).map((p) => p.id);
  return {
    ...state,
    pendingChoice: { mode: "fingerCount", cardId, actorPlayerId, eligiblePlayerIds, choices: {} },
  };
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}

/**
 * Enregistre le choix d'un joueur pour le choix simultané en cours (Bataille,
 * Chiffre). Une fois que tous les joueurs éligibles ont choisi, résout selon
 * `pendingChoice.mode` et efface `pendingChoice`.
 */
export function submitChoice(state: GameState, playerId: PlayerId, value: string): EngineResult {
  if (!state.pendingChoice) {
    throw new GameLogicError("Aucun choix en cours", "NO_PENDING_CHOICE", { playerId });
  }
  if (!state.pendingChoice.eligiblePlayerIds.includes(playerId)) {
    throw new GameLogicError("Ce joueur n'est pas concerné par ce choix", "NOT_ELIGIBLE_FOR_CHOICE", { playerId });
  }

  if (state.pendingChoice.mode === "rockPaperScissors") {
    if (value !== "pierre" && value !== "feuille" && value !== "ciseaux") {
      throw new GameLogicError("Choix invalide pour Bataille", "INVALID_CHOICE", { playerId, value });
    }
    const rpsChoice: "pierre" | "feuille" | "ciseaux" = value;
    const pendingChoice = {
      ...state.pendingChoice,
      choices: { ...state.pendingChoice.choices, [playerId]: rpsChoice },
    };
    let next: GameState = { ...state, pendingChoice };
    const sideEffects: SideEffect[] = [{ type: "CHOICE_MADE", playerId }];

    const allChosen = pendingChoice.eligiblePlayerIds.every((id) => pendingChoice.choices[id] !== undefined);
    if (!allChosen) {
      return { state: next, sideEffects };
    }
    next = { ...next, pendingChoice: null };
    const losingValue =
      pendingChoice.losingShape === "differentFromActor" ? pendingChoice.choices[pendingChoice.actorPlayerId] : pendingChoice.losingShape;
    // "differentFromActor" : perdent ceux qui n'ont PAS choisi la même forme que
    // l'auteur — l'auteur lui-même ne peut jamais perdre via cette règle (il
    // correspond toujours à son propre choix).
    const losers =
      pendingChoice.losingShape === "differentFromActor"
        ? pendingChoice.eligiblePlayerIds.filter((id) => pendingChoice.choices[id] !== losingValue)
        : pendingChoice.eligiblePlayerIds.filter((id) => pendingChoice.choices[id] === losingValue);
    if (losers.length > 0) {
      const result = eliminateSpecificPlayers(next, losers);
      return { state: result.state, sideEffects: [...sideEffects, ...result.sideEffects] };
    }
    return { state: next, sideEffects };
  }

  // mode === "fingerCount"
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new GameLogicError("Choix invalide pour Chiffre (1 à 5 doigts)", "INVALID_CHOICE", { playerId, value });
  }
  const pendingChoice = {
    ...state.pendingChoice,
    choices: { ...state.pendingChoice.choices, [playerId]: parsed as 1 | 2 | 3 | 4 | 5 },
  };
  let next: GameState = { ...state, pendingChoice };
  const sideEffects: SideEffect[] = [{ type: "CHOICE_MADE", playerId }];

  const allChosen = pendingChoice.eligiblePlayerIds.every((id) => pendingChoice.choices[id] !== undefined);
  if (!allChosen) {
    return { state: next, sideEffects };
  }
  next = { ...next, pendingChoice: null };
  const sum = pendingChoice.eligiblePlayerIds.reduce((total, id) => total + (pendingChoice.choices[id] ?? 0), 0);
  if (isPrime(sum)) {
    const result = declareWinners(next, [pendingChoice.actorPlayerId]);
    return { state: result.state, sideEffects: [...sideEffects, ...result.sideEffects] };
  }
  return { state: next, sideEffects };
}

/** Ouvre "Nez à nez"/"Pied de nez" : tous les joueurs en jeu (porteur inclus) peuvent basculer leur bouton "nez" jusqu'à la résolution par minuteur. */
export function startNoseCountdown(
  state: GameState,
  cardId: CardId,
  holderId: PlayerId,
  seconds: number,
  eliminateIfTouching: boolean,
): GameState {
  const eligiblePlayerIds = state.players.filter((p) => !p.isEliminated).map((p) => p.id);
  return {
    ...state,
    pendingNoseCountdown: { cardId, holderId, seconds, eliminateIfTouching, eligiblePlayerIds, touching: {} },
  };
}

/** Bascule l'état "touche son nez" d'un joueur pendant le décompte — librement modifiable, aucune résolution ici. */
export function toggleNoseTouch(state: GameState, playerId: PlayerId, touching: boolean): EngineResult {
  if (!state.pendingNoseCountdown) {
    throw new GameLogicError("Aucun décompte en cours", "NO_PENDING_NOSE_COUNTDOWN", { playerId });
  }
  if (!state.pendingNoseCountdown.eligiblePlayerIds.includes(playerId)) {
    throw new GameLogicError("Ce joueur n'est pas concerné par ce décompte", "NOT_ELIGIBLE_FOR_NOSE_COUNTDOWN", {
      playerId,
    });
  }
  const pendingNoseCountdown = {
    ...state.pendingNoseCountdown,
    touching: { ...state.pendingNoseCountdown.touching, [playerId]: touching },
  };
  return { state: { ...state, pendingNoseCountdown }, sideEffects: [{ type: "NOSE_TOUCH_CHANGED", playerId, touching }] };
}

/**
 * Résout le décompte en cours à partir de l'état `touching` actuel — jamais
 * déclenché par une action de joueur, uniquement par le minuteur de
 * `GameService` (voir `NoseCountdownResolvedEvent`). Élimine ceux qui NE
 * touchent PAS leur nez (Nez à nez) ou ceux qui touchent ENCORE leur nez,
 * porteur inclus (Pied de nez) selon `eliminateIfTouching`.
 */
export function resolveNoseCountdown(state: GameState): EngineResult {
  if (!state.pendingNoseCountdown) {
    throw new GameLogicError("Aucun décompte en cours", "NO_PENDING_NOSE_COUNTDOWN", {});
  }
  const { eligiblePlayerIds, touching, eliminateIfTouching } = state.pendingNoseCountdown;
  const toEliminate = eligiblePlayerIds.filter((id) => {
    const isTouching = touching[id] ?? false;
    return eliminateIfTouching ? isTouching : !isTouching;
  });
  const next: GameState = { ...state, pendingNoseCountdown: null };
  return eliminateSpecificPlayers(next, toEliminate);
}

/** Ouvre "Du chocolat !" : tous les joueurs en jeu (porteur inclus) peuvent cliquer "Poser sa main" jusqu'à résolution. */
export function startHandSlap(
  state: GameState,
  cardId: CardId,
  holderId: PlayerId,
  mode: "firstLoses" | "lastLoses" | "onlyFirstSurvives",
): GameState {
  const eligiblePlayerIds = state.players.filter((p) => !p.isEliminated).map((p) => p.id);
  return {
    ...state,
    pendingHandSlap: { cardId, holderId, mode, eligiblePlayerIds, order: [] },
  };
}

/**
 * Enregistre l'arrivée d'un joueur dans la course au clic — l'ordre est celui
 * de réception côté serveur. Résout automatiquement dès que tous les joueurs
 * éligibles ont cliqué (voir GameState.pendingHandSlap.mode).
 */
export function slapHand(state: GameState, playerId: PlayerId): EngineResult {
  if (!state.pendingHandSlap) {
    throw new GameLogicError("Aucune course au clic en cours", "NO_PENDING_HAND_SLAP", { playerId });
  }
  if (!state.pendingHandSlap.eligiblePlayerIds.includes(playerId)) {
    throw new GameLogicError("Ce joueur n'est pas concerné par cette course au clic", "NOT_ELIGIBLE_FOR_HAND_SLAP", {
      playerId,
    });
  }
  if (state.pendingHandSlap.order.includes(playerId)) {
    // Déjà cliqué — idempotent, pas d'erreur (peut arriver sur un double-clic réseau).
    return { state, sideEffects: [] };
  }

  const pendingHandSlap = { ...state.pendingHandSlap, order: [...state.pendingHandSlap.order, playerId] };
  let next: GameState = { ...state, pendingHandSlap };
  const sideEffects: SideEffect[] = [{ type: "HAND_SLAPPED", playerId }];

  const allSlapped = pendingHandSlap.eligiblePlayerIds.every((id) => pendingHandSlap.order.includes(id));
  if (!allSlapped) {
    return { state: next, sideEffects };
  }
  next = { ...next, pendingHandSlap: null };

  const { mode, order } = pendingHandSlap;
  let toEliminate: PlayerId[];
  if (mode === "firstLoses") {
    toEliminate = [order[0]!];
  } else if (mode === "lastLoses") {
    toEliminate = [order[order.length - 1]!];
  } else {
    toEliminate = order.slice(1); // onlyFirstSurvives : tout le monde sauf le premier
  }
  const result = eliminateSpecificPlayers(next, toEliminate);
  return { state: result.state, sideEffects: [...sideEffects, ...result.sideEffects] };
}

/**
 * Enregistre le vote d'un joueur. Une fois que tous les joueurs éligibles ont
 * voté, résout automatiquement (élimination ou perte de carte selon le choix
 * de chacun) et efface `pendingVote`.
 */
export function castVote(state: GameState, playerId: PlayerId, choice: VoteChoice): EngineResult {
  if (!state.pendingVote) {
    throw new GameLogicError("Aucun vote en cours", "NO_PENDING_VOTE", { playerId });
  }
  if (!state.pendingVote.eligiblePlayerIds.includes(playerId)) {
    throw new GameLogicError("Ce joueur n'est pas concerné par ce vote", "NOT_ELIGIBLE_FOR_VOTE", { playerId });
  }

  const pendingVote = { ...state.pendingVote, votes: { ...state.pendingVote.votes, [playerId]: choice } };
  let next: GameState = { ...state, pendingVote };
  const sideEffects: SideEffect[] = [{ type: "VOTE_CAST", playerId }];

  const allVoted = pendingVote.eligiblePlayerIds.every((id) => pendingVote.votes[id] !== undefined);
  if (!allVoted) {
    return { state: next, sideEffects };
  }
  next = { ...next, pendingVote: null };

  if (pendingVote.mode === "simultaneous") {
    const toEliminate: PlayerId[] = [];
    for (const id of pendingVote.eligiblePlayerIds) {
      const outcome = pendingVote.votes[id] === "oui" ? pendingVote.onYes : pendingVote.onNo;
      if (outcome === "ELIMINATE") {
        toEliminate.push(id);
      } else if (outcome === "LOSE_CARD") {
        next = moveFirstHandCardToDiscard(next, id);
        sideEffects.push({ type: "CARD_LOST_TO_DISCARD", playerId: id });
      } else if (outcome === "GIVE_CARD_TO_ACTOR" && id !== pendingVote.actorPlayerId) {
        next = moveFirstHandCardToPlayer(next, id, pendingVote.actorPlayerId);
        sideEffects.push({ type: "CARDS_GIVEN", playerId: pendingVote.actorPlayerId, count: 1 });
      }
    }
    if (toEliminate.length > 0) {
      const result = eliminateSpecificPlayers(next, toEliminate);
      next = result.state;
      sideEffects.push(...result.sideEffects);
    }
    return { state: next, sideEffects };
  }

  if (pendingVote.mode === "cakeOrGrave") {
    const tombeauVoters = pendingVote.eligiblePlayerIds.filter((id) => pendingVote.votes[id] === "oui");
    const gateauVoters = pendingVote.eligiblePlayerIds.filter((id) => pendingVote.votes[id] === "non");

    if (tombeauVoters.length === gateauVoters.length) {
      const result = declareWinners(next, [pendingVote.actorPlayerId]);
      return { state: result.state, sideEffects: [...sideEffects, ...result.sideEffects] };
    }
    const toEliminate = tombeauVoters.length > gateauVoters.length ? [pendingVote.actorPlayerId] : tombeauVoters;
    const result = eliminateSpecificPlayers(next, toEliminate);
    return { state: result.state, sideEffects: [...sideEffects, ...result.sideEffects] };
  }

  if (pendingVote.mode === "deathOrTchi") {
    const tchiVoters = pendingVote.eligiblePlayerIds.filter((id) => pendingVote.votes[id] === "oui");
    if (tchiVoters.length === 1) {
      const result = declareWinners(next, [tchiVoters[0]!]);
      return { state: result.state, sideEffects: [...sideEffects, ...result.sideEffects] };
    }
    if (tchiVoters.length > 1) {
      const result = eliminateSpecificPlayers(next, tchiVoters);
      return { state: result.state, sideEffects: [...sideEffects, ...result.sideEffects] };
    }
    return { state: next, sideEffects };
  }

  if (pendingVote.mode === "winClaim") {
    // Majorité stricte de "oui" (condition vraie) requise — égalité ou
    // majorité de "non" -> rien ne se passe (pas de pénalité pour une
    // fausse tentative, le texte de la carte ne le prévoit pas).
    const trueVotes = pendingVote.eligiblePlayerIds.filter((id) => pendingVote.votes[id] === "oui").length;
    const falseVotes = pendingVote.eligiblePlayerIds.filter((id) => pendingVote.votes[id] === "non").length;
    if (trueVotes > falseVotes) {
      const result = declareWinners(next, [pendingVote.actorPlayerId]);
      return { state: result.state, sideEffects: [...sideEffects, ...result.sideEffects] };
    }
    return { state: next, sideEffects };
  }

  // mode === "denunciation" : majorité stricte de "oui" (coupable) requise —
  // égalité ou majorité de "non" -> rien ne se passe.
  const guiltyVotes = pendingVote.eligiblePlayerIds.filter((id) => pendingVote.votes[id] === "oui").length;
  const notGuiltyVotes = pendingVote.eligiblePlayerIds.filter((id) => pendingVote.votes[id] === "non").length;
  if (guiltyVotes > notGuiltyVotes) {
    const result = eliminateSpecificPlayers(next, [pendingVote.accusedId]);
    return { state: result.state, sideEffects: [...sideEffects, ...result.sideEffects] };
  }
  return { state: next, sideEffects };
}

/**
 * Ajoute des points à un joueur puis vérifie la condition de victoire par
 * points (le premier à atteindre `state.pointsToWin` gagne immédiatement).
 */
export function addPoints(state: GameState, playerId: PlayerId, amount: number): EngineResult {
  let next = updatePlayer(state, playerId, (p) => ({ ...p, points: p.points + amount }));
  const sideEffects: SideEffect[] = [{ type: "POINTS_ADDED", playerId, amount }];

  const player = next.players.find((p) => p.id === playerId);
  if (player && player.points >= next.pointsToWin) {
    next = { ...next, phase: "ended", winnerIds: [playerId] };
    sideEffects.push({ type: "GAME_WON", winnerIds: [playerId] });
  }

  return { state: next, sideEffects };
}

export function setPointsToWin(state: GameState, value: number): GameState {
  return { ...state, pointsToWin: value };
}

/** "Câlin de groupe" : tous les joueurs actuellement en jeu gagnent ensemble. */
export function winAllAlivePlayers(state: GameState): EngineResult {
  const aliveIds = state.players.filter((p) => !p.isEliminated).map((p) => p.id);
  return declareWinners(state, aliveIds);
}

/** Compte les exemplaires de `cardName` face visible sur la table, toutes piles confondues. */
export function countCardOnBoard(state: GameState, cardName: string): number {
  return state.players.reduce(
    (total, p) => total + p.playedCards.filter((c) => c.name === cardName).length,
    0,
  );
}

/**
 * Déclencheur "fin de tour" : si le joueur dont le tour se termine a encore
 * devant lui une carte "danger" (ex: Dragon, Laser) non redirigée entre-temps,
 * il est éliminé. Appelé avant `advanceTurn` lors du traitement de TURN_ENDED.
 */
/** Arme "Finito" : la prochaine fois que le tour du porteur se termine, tout le monde sera éliminé (voir checkFinito). */
export function scheduleFinito(state: GameState, holderId: PlayerId): GameState {
  return { ...state, pendingFinito: { holderId, primed: false } };
}

/**
 * Déclencheur "fin de tour" pour "Finito" : la première fois que le tour du
 * porteur se termine après avoir joué la carte, on se contente d'armer le
 * marqueur (`primed = true`, pas d'élimination) — le texte dit "à la fin de
 * VOTRE PROCHAIN tour", pas celui-ci. La fois suivante, tout le monde est
 * éliminé, sans exception (y compris le porteur), et le marqueur est effacé.
 */
export function checkFinito(state: GameState, endingPlayerId: PlayerId): EngineResult {
  if (!state.pendingFinito || state.pendingFinito.holderId !== endingPlayerId) {
    return { state, sideEffects: [] };
  }
  if (!state.pendingFinito.primed) {
    return { state: { ...state, pendingFinito: { ...state.pendingFinito, primed: true } }, sideEffects: [] };
  }
  const result = eliminateAllAlivePlayers(state);
  return { state: { ...result.state, pendingFinito: null }, sideEffects: result.sideEffects };
}

/**
 * "Foire aux bombes" : chaque joueur révèle les "Bombe" de sa main (placées
 * face visible devant lui, le reste de sa main ne bouge pas). Si le total de
 * Bombes désormais sur la table atteint `threshold`, `playerId` (l'auteur de
 * la carte) gagne immédiatement ; sinon rien d'autre ne se passe.
 */
export function revealBombsAndWinIfEnough(state: GameState, playerId: PlayerId, threshold: number): EngineResult {
  const sideEffects: SideEffect[] = [];
  let next = state;

  for (const player of state.players) {
    const bombs = player.hand.filter((c) => c.name === "Bombe");
    if (bombs.length === 0) continue;
    next = updatePlayer(next, player.id, (p) => ({
      ...p,
      hand: p.hand.filter((c) => c.name !== "Bombe"),
      playedCards: [...p.playedCards, ...bombs],
    }));
    for (const bomb of bombs) {
      sideEffects.push({ type: "CARD_MOVED_TO_PLAYED", playerId: player.id, cardId: bomb.id });
    }
  }

  if (countCardOnBoard(next, "Bombe") >= threshold) {
    const result = declareWinners(next, [playerId]);
    return { state: result.state, sideEffects: [...sideEffects, ...result.sideEffects] };
  }

  return { state: next, sideEffects };
}

export function checkEndOfTurnDanger(state: GameState, playerId: PlayerId): EngineResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.isEliminated) {
    return { state, sideEffects: [] };
  }

  const hasDanger = player.playedCards.some((c) =>
    c.effects.some((e) => e.type === "ELIMINATE_AT_END_OF_TURN_IF_PRESENT"),
  );
  if (!hasDanger) {
    return { state, sideEffects: [] };
  }

  return eliminatePlayer(state, playerId);
}
