export type CardId = string;
export type PlayerId = string;
export type RoomId = string;

/**
 * Catégories physiques du jeu : cartes normales, cartes Étoile (plus fortes),
 * cartes de l'extension Chaos (format paysage, hors scope v1), cartes vierges
 * (custom, hors scope v1).
 */
export type CardRarity = "normale" | "etoile" | "chaos" | "vierge";

/**
 * Effets mécaniques que le moteur pur sait résoudre automatiquement.
 * Liste volontairement minimale au démarrage — étendue au fil de l'implémentation
 * des cartes réelles. Une carte sans effet automatisé correspondant reste "manuelle".
 */
export type AutomatedEffect =
  | { type: "DRAW_CARDS"; count: number }
  | { type: "SKIP_NEXT_TURN" }
  | { type: "PLAY_AGAIN" }
  | { type: "PLACE_IN_FRONT_OF_SELF" }
  | { type: "PLACE_IN_FRONT_OF_TARGET" }
  | { type: "ELIMINATE_SELF" }
  | { type: "ELIMINATE_TARGET" };

export type Card = {
  id: CardId;
  name: string;
  rarity: CardRarity;
  /** Texte d'instruction complet tel qu'imprimé sur la carte. */
  text: string;
  /** Absent = effet manuel : le moteur affiche `text` et attend une confirmation des joueurs. */
  effect?: AutomatedEffect;
};

export type Player = {
  id: PlayerId;
  name: string;
  hand: Card[];
  /** Cartes jouées par ce joueur, visibles sur la table jusqu'à la fin de la partie (même après élimination). */
  playedCards: Card[];
  isEliminated: boolean;
  points: number;
  /** Consommé (remis à false) au moment où ce joueur aurait dû jouer. */
  skipNextTurn: boolean;
};

export type GamePhase = "lobby" | "playing" | "ended";

export type GameState = {
  roomId: RoomId;
  phase: GamePhase;
  /** Ordre de tour de jeu. */
  players: Player[];
  currentPlayerId: PlayerId | null;
  drawPile: Card[];
  /** Défausse commune (distincte des piles personnelles `Player.playedCards`). */
  discardPile: Card[];
  winnerId: PlayerId | null;
};
