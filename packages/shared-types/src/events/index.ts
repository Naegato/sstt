import type { Card, CardId, PlayerId, VoteChoice } from "../game/types.js";

type BaseEvent = { timestamp: number };

export type PlayerJoinedEvent = BaseEvent & {
  type: "PLAYER_JOINED";
  playerId: PlayerId;
  playerName: string;
};

export type GameStartedEvent = BaseEvent & {
  type: "GAME_STARTED";
  /**
   * Deck déjà mélangé, dans l'ordre de pioche. Le mélange (aléatoire) se fait côté
   * service AVANT de créer l'event — le moteur pur ne mélange jamais lui-même,
   * pour garantir que rejouer les mêmes events produit toujours le même état.
   */
  deck: Card[];
};

export type CardDrawnEvent = BaseEvent & {
  type: "CARD_DRAWN";
  playerId: PlayerId;
  cardId: CardId;
};

export type CardPlayedEvent = BaseEvent & {
  type: "CARD_PLAYED";
  playerId: PlayerId;
  cardId: CardId;
  targetPlayerId?: PlayerId;
  /**
   * Réservé aux cartes à double usage (ex: Embuscade de chatons, effet
   * `CANCEL_LAST_PLAYED_CARD`) : `true` = jouée en interruption, hors tour, à
   * tout moment — seul l'effet d'interruption s'applique. `false`/absent =
   * jouée normalement à son tour, les autres effets de la carte s'appliquent.
   */
  playedAsInterrupt?: boolean;
  /**
   * Réservé aux cartes nécessitant de l'aléatoire (ex: Politique, effet
   * `RESHUFFLE_ALL_HANDS_AND_REDRAW`) : ordre de pioche déjà mélangé, calculé
   * côté service AVANT de construire l'event (même principe que
   * `GameStartedEvent.deck` — le moteur pur ne mélange jamais lui-même).
   */
  shuffledDrawPileOrder?: Card[];
  /**
   * Réservé à "Ninjas" (effet `STEAL_RANDOM_CARD_AND_FORCE_PLAY`) : id de la
   * carte tirée au hasard dans la main de `targetPlayerId`, calculé côté
   * service AVANT de construire l'event (même principe que
   * `shuffledDrawPileOrder`) — le moteur pur ne tire jamais au hasard
   * lui-même. Absent si la main de la cible est vide (rien à voler).
   */
  stolenCardId?: CardId;
  /**
   * Réservé à "Vous avez gagné !" (effet `WIN_IF_CONDITION_ELSE_POINTS`) :
   * choix du joueur au moment de jouer la carte entre tenter de gagner
   * (`true`) ou simplement poser la carte pour les points de repli (`false`/
   * absent) — même principe de choix au moment du jeu que `playedAsInterrupt`.
   */
  claimWin?: boolean;
};

/** Confirmation déclarative qu'un effet manuel (texte affiché) a bien été exécuté. */
export type ManualActionConfirmedEvent = BaseEvent & {
  type: "MANUAL_ACTION_CONFIRMED";
  playerId: PlayerId;
  cardId: CardId;
};

/** Un autre joueur conteste qu'une action manuelle ait bien été respectée. */
export type EliminationChallengedEvent = BaseEvent & {
  type: "ELIMINATION_CHALLENGED";
  challengerId: PlayerId;
  targetPlayerId: PlayerId;
  reason: string;
};

export type PlayerEliminatedEvent = BaseEvent & {
  type: "PLAYER_ELIMINATED";
  playerId: PlayerId;
  reason: "cannot_play" | "missed_action" | "card_effect" | "challenge_upheld";
};

export type TurnEndedEvent = BaseEvent & {
  type: "TURN_ENDED";
  playerId: PlayerId;
};

export type GameEndedEvent = BaseEvent & {
  type: "GAME_ENDED";
  winnerIds: PlayerId[] | null;
};

/** Un joueur soumet son vote pour le vote simultané en cours (voir GameState.pendingVote). */
export type VoteCastEvent = BaseEvent & {
  type: "VOTE_CAST";
  playerId: PlayerId;
  choice: VoteChoice;
};

/**
 * Action optionnelle "Pingouins" (`STEAL_ON_TURN_START`) : au début de son
 * propre tour, un joueur qui a cette carte en jeu peut voler `cardId` dans la
 * pile de `targetPlayerId`. Au plus 1 fois par tour (voir GameState.stolenThisTurn).
 */
export type PlayedCardStolenEvent = BaseEvent & {
  type: "STEAL_PLAYED_CARD";
  playerId: PlayerId;
  targetPlayerId: PlayerId;
  cardId: CardId;
};

/**
 * Action obligatoire "Patate chaude" (`MUST_PASS_BEFORE_PLAYING`) : le joueur
 * courant passe la carte au joueur suivant (destinataire déterministe, pas de
 * choix) avant de jouer sa carte. S'il joue sans l'avoir fait, il est éliminé
 * (voir la vérification dans `playCard()`, apps/server/src/engine/cards.ts).
 */
export type HotPotatoPassedEvent = BaseEvent & {
  type: "PASS_HOT_POTATO";
  playerId: PlayerId;
};

/**
 * "Rejouer une partie" : remet la room en lobby avec les MÊMES joueurs (id/nom
 * conservés), mains/cartes posées/points/élimination/etc réinitialisés — voir
 * `resetGameToLobby()` dans `apps/server/src/engine/state.ts`. Seule exception,
 * comme "Enfoiré !", au court-circuit `phase === "ended"` de `processEvent()`.
 */
export type GameResetEvent = BaseEvent & {
  type: "GAME_RESET";
};

/**
 * Un joueur soumet son choix pour le choix simultané en cours (voir
 * GameState.pendingChoice — Bataille, Chiffre). `value` est libre côté type
 * (validée côté moteur selon `pendingChoice.mode`), même principe que
 * `VoteCastEvent.choice` pour les votes oui/non.
 */
export type ChoiceSubmittedEvent = BaseEvent & {
  type: "CHOICE_SUBMITTED";
  playerId: PlayerId;
  value: string;
};

/**
 * Un joueur bascule l'état de son bouton "nez" pendant un décompte en cours
 * (voir GameState.pendingNoseCountdown — Nez à nez, Pied de nez). Librement
 * modifiable plusieurs fois avant la résolution, contrairement à un vote/choix.
 */
export type NoseTouchToggledEvent = BaseEvent & {
  type: "NOSE_TOUCH_TOGGLED";
  playerId: PlayerId;
  touching: boolean;
};

/**
 * Résout le décompte en cours (voir GameState.pendingNoseCountdown), en
 * lisant l'état `touching` de chaque joueur éligible tel qu'il est au moment
 * de cet event. Contrairement aux votes/choix, jamais déclenché par une
 * action de joueur : dispatché côté GameService via un minuteur, une fois
 * les `seconds` du décompte écoulées (le moteur pur ne connaît jamais l'horloge).
 */
export type NoseCountdownResolvedEvent = BaseEvent & {
  type: "NOSE_COUNTDOWN_RESOLVED";
};

/**
 * Un joueur clique "Poser sa main" pendant une course au clic en cours (voir
 * GameState.pendingHandSlap — Du chocolat !). Le serveur horodate l'ordre
 * d'arrivée à la réception ; résolu dès que tous les joueurs éligibles ont cliqué.
 */
export type HandSlappedEvent = BaseEvent & {
  type: "HAND_SLAPPED";
  playerId: PlayerId;
};

export type GameEvent =
  | PlayerJoinedEvent
  | GameStartedEvent
  | CardDrawnEvent
  | CardPlayedEvent
  | ManualActionConfirmedEvent
  | EliminationChallengedEvent
  | PlayerEliminatedEvent
  | TurnEndedEvent
  | GameEndedEvent
  | VoteCastEvent
  | PlayedCardStolenEvent
  | HotPotatoPassedEvent
  | GameResetEvent
  | ChoiceSubmittedEvent
  | NoseTouchToggledEvent
  | NoseCountdownResolvedEvent
  | HandSlappedEvent;
