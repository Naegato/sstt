// Harnais e2e réutilisable pour vérifier une carte en live contre le vrai serveur
// (socket.io réel, catalogue réel). Évite de réécrire tout le boilerplate
// (connexion, event names, gestion PLAY_AGAIN/pendingVote/END_TURN) à chaque carte.
//
// Usage : bun apps/server/scripts/e2e-harness.mjs <cardName> [numPlayers]
// Le serveur doit déjà tourner sur http://localhost:3001.
//
// Simule des tours "raisonnables" (cible auto-fournie si besoin, cartes réactives
// évitées) jusqu'à trouver <cardName> jouable quelque part, puis s'arrête et
// affiche l'état complet pour inspection manuelle / assertions ad-hoc via
// l'option --script (voir bas de fichier pour brancher une vérification custom).

import { io } from "socket.io-client";

const URL = "http://localhost:3001";

export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
  ]);
}

export function connect(roomId, playerId, name) {
  return new Promise((resolve) => {
    const socket = io(URL, { transports: ["websocket"] });
    socket.on("connect", () => socket.emit("room:join", { roomId, playerId, playerName: name }));
    socket.once("room:joined", () => resolve(socket));
    socket.on("error:message", (err) => console.log(`ERROR [${playerId}]:`, err.message, err.code));
  });
}

export function makeUpdateQueue(socket) {
  const queue = [];
  const waiters = [];
  socket.on("game:state-update", (payload) => {
    if (waiters.length > 0) waiters.shift()(payload);
    else queue.push(payload);
  });
  return {
    next: () =>
      withTimeout(
        new Promise((resolve) => {
          if (queue.length > 0) resolve(queue.shift());
          else waiters.push(resolve);
        }),
        5000,
        "state update",
      ),
  };
}

/** Démarre N joueurs connectés + partie lancée. Retourne {players, q, state}. */
export async function setupGame(roomId, numPlayers) {
  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push(await connect(roomId, `p${i}`, `Player${i}`));
  }
  const observer = players[0];
  const q = makeUpdateQueue(observer);
  observer.emit("game:start", { roomId });
  const state = (await q.next()).state;
  return { players, q, state };
}

/**
 * Joue le tour du joueur courant "raisonnablement" : évite les cartes réactives
 * injouables, fournit une cible auto si nécessaire, résout un pendingVote en
 * votant "non" partout, gère PLAY_AGAIN et END_TURN. Retourne le nouvel état.
 */
export async function playOneTurn(roomId, players, q, state) {
  const currentId = state.currentPlayerId;
  const owner = players[Number(currentId.slice(1))];
  const player = state.players.find((p) => p.id === currentId);
  if (player.hand.length === 0) return state;

  // REDIRECT_NAMED_CARD_OR_DRAW (Bouclier...) n'exige un target QUE si une carte
  // correspondante est déjà sur le plateau du joueur, mais fournir un target
  // dans tous les cas est sans danger (ignoré sinon) -> on le fait toujours,
  // pour ne pas avoir à réévaluer cette condition dans chaque scénario e2e.
  const needsTarget = (c) =>
    c.effects.some(
      (e) =>
        e.type === "PLACE_IN_FRONT_OF_TARGET" ||
        e.type === "GIVE_CARDS_TO_TARGET" ||
        e.type === "REDIRECT_NAMED_CARD_OR_DRAW",
    );
  const isUnplayableNow = (c) =>
    (c.effects.some((e) => e.type === "REACT_TO_OWN_ELIMINATION") && !player.isEliminated) ||
    (c.effects.some((e) => e.type === "REACT_TO_GROUP_ELIMINATION") &&
      !(player.isEliminated && state.lastEliminationBatch?.includes(player.id))) ||
    // Enfoiré ! : jouable uniquement en réaction à une victoire (phase déjà
    // "ended"), jamais comme un coup normal pendant un tour classique.
    c.effects.some((e) => e.type === "REACT_TO_OTHER_PLAYER_VICTORY");
  const cardToPlay = player.hand.find((c) => !isUnplayableNow(c));
  if (!cardToPlay) {
    // Toute la main est injouable maintenant (que des cartes réactives) -- on
    // ne tente rien, on passe directement au tour suivant.
    owner.emit("game:end-turn", { roomId, playerId: currentId });
    return (await q.next()).state;
  }
  const alivePlayerIds = state.players.filter((p) => !p.isEliminated && p.id !== currentId).map((p) => p.id);
  const targetPlayerId = needsTarget(cardToPlay) ? alivePlayerIds[0] : undefined;

  const errorRacer = new Promise((resolve) => owner.once("error:message", () => resolve({ error: true })));
  owner.emit("game:play-card", { roomId, playerId: currentId, cardId: cardToPlay.id, targetPlayerId });
  let update = await withTimeout(Promise.race([q.next().then((u) => ({ error: false, u })), errorRacer]), 5000, "play or error");
  if (update.error) {
    owner.emit("game:end-turn", { roomId, playerId: currentId });
    return (await q.next()).state;
  }
  update = update.u;
  state = update.state;
  if (state.phase === "ended") return state;

  if (state.pendingVote) {
    for (const id of state.pendingVote.eligiblePlayerIds) {
      const s = players[Number(id.slice(1))];
      s.emit("game:cast-vote", { roomId, playerId: id, choice: "non" });
      update = await q.next();
      state = update.state;
    }
  }
  if (state.phase === "ended") return state;

  const grantsPlayAgain = update.sideEffects?.some((e) => e.type === "PLAY_AGAIN_GRANTED");
  if (!grantsPlayAgain) {
    owner.emit("game:end-turn", { roomId, playerId: currentId });
    update = await q.next();
    state = update.state;
  }
  return state;
}

/** Simule jusqu'à `maxTurns` tours ou jusqu'à ce que `stopWhen(state)` soit vrai. Retourne le state final. */
export async function playUntil(roomId, players, q, state, stopWhen, maxTurns = 250) {
  for (let i = 0; i < maxTurns && state.phase === "playing"; i++) {
    if (stopWhen(state)) return state;
    state = await playOneTurn(roomId, players, q, state);
  }
  return state;
}

export function ownerSocketFor(players, playerId) {
  return players[Number(playerId.slice(1))];
}
