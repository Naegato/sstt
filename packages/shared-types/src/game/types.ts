export type CardId = string;
export type PlayerId = string;
export type RoomId = string;

/**
 * Catégories physiques du jeu : cartes normales, cartes Étoile (plus fortes),
 * cartes de l'extension Chaos (format paysage, hors scope v1), cartes vierges
 * (custom, hors scope v1).
 */
export type CardRarity = "normale" | "etoile" | "chaos" | "vierge";

export type VoteChoice = "oui" | "non";

/** Ce qui arrive à un joueur selon son vote, une fois le vote simultané révélé. */
export type VoteOutcome = "ELIMINATE" | "LOSE_CARD" | "GIVE_CARD_TO_ACTOR" | "NOTHING";

/**
 * Effets mécaniques que le moteur pur sait résoudre automatiquement.
 * Liste étendue au fil de l'implémentation des cartes réelles. Une carte sans
 * effet automatisé correspondant reste "manuelle".
 */
export type AutomatedEffect =
  | { type: "DRAW_CARDS"; count: number }
  | { type: "SKIP_NEXT_TURN" }
  | { type: "PLAY_AGAIN" }
  | { type: "PLACE_IN_FRONT_OF_SELF" }
  | { type: "PLACE_IN_FRONT_OF_TARGET" }
  | { type: "ELIMINATE_SELF" }
  | { type: "ELIMINATE_TARGET" }
  | { type: "ADD_POINTS"; amount: number }
  | { type: "SET_POINTS_TO_WIN"; value: number }
  /** Si `threshold` exemplaires de `cardName` sont face visible sur la table (toutes piles confondues), élimine tous les joueurs en jeu. */
  | { type: "CHECK_BOARD_ELIMINATION"; cardName: string; threshold: number }
  /** Marqueur passif : si cette carte est encore dans la pile du joueur courant à la fin de son tour, il est éliminé (ex: Dragon, Laser). */
  | { type: "ELIMINATE_AT_END_OF_TURN_IF_PRESENT" }
  /** Si une carte nommée dans `matchNames` est déjà dans la pile du joueur, la déplace vers la cible ; sinon pioche `drawCountIfNone` cartes. */
  | { type: "REDIRECT_NAMED_CARD_OR_DRAW"; matchNames: string[]; drawCountIfNone: number }
  /** Le joueur qui JOUE la carte (pas la cible) saute ses `count` prochains tours. */
  | { type: "SKIP_OWN_NEXT_TURNS"; count: number }
  /** Si, après application, exactement `count` joueurs sont encore en jeu, le joueur qui a joué la carte gagne. */
  | { type: "WIN_IF_ALIVE_COUNT"; count: number }
  /** Ouvre un vote simultané oui/non pour tous les joueurs en jeu (ex: Cadeaux). Résolu par des events VOTE_CAST. */
  | { type: "START_SIMULTANEOUS_VOTE"; onYes: VoteOutcome; onNo: VoteOutcome }
  /** Donne `count` cartes de la main du joueur qui joue la carte vers la main du joueur cible. */
  | { type: "GIVE_CARDS_TO_TARGET"; count: number }
  /**
   * Ouvre un vote à majorité "Gâteau ou Tombeau" pour tous les AUTRES joueurs en jeu
   * (le joueur qui a joué la carte ne vote pas). Majorité "tombeau" (oui) → il est
   * éliminé. Majorité "gâteau" (non) → ceux qui ont voté tombeau sont éliminés.
   * Égalité → il gagne immédiatement la partie.
   */
  | { type: "START_MAJORITY_VOTE_CAKE_OR_GRAVE" }
  /**
   * Ouvre un vote à majorité "La mort ou Tchi-tchi" pour TOUS les joueurs en jeu, y
   * compris celui qui a joué la carte. Exactement 1 "tchi-tchi" (oui) → ce joueur
   * gagne immédiatement. 2+ "tchi-tchi" → ils sont tous éliminés. 0 → rien ne se passe.
   */
  | { type: "START_MAJORITY_VOTE_DEATH_OR_TCHI" }
  /**
   * Carte réactive (ex: Vie supplémentaire) : jouable hors tour, uniquement par
   * un joueur actuellement éliminé — annule son élimination et pioche 1 carte.
   * Limite assumée : si son élimination avait déjà mis fin à la partie (plus
   * personne d'autre en jeu), la victoire est déclarée avant toute réaction possible.
   */
  | { type: "REACT_TO_OWN_ELIMINATION" }
  /**
   * Carte réactive (ex: Gros nul !) : jouable hors tour, uniquement par un joueur
   * qui vient d'être éliminé EN GROUPE (voir `GameState.lastEliminationBatch`,
   * ≥2 joueurs éliminés ensemble par le même event, sans que la partie soit
   * terminée). `targetPlayerId` désigne le joueur du groupe qui reste seul
   * éliminé ; tous les autres membres du groupe (dont l'auteur, sauf s'il se
   * désigne lui-même) sont réintégrés. Fenêtre de réaction fermée dès qu'un
   * autre event (fin de tour, carte non-réactive) survient — voir cards.ts/state.ts.
   */
  | { type: "REACT_TO_GROUP_ELIMINATION" }
  /**
   * Carte à double usage (ex: Embuscade de chatons) : jouée normalement à son
   * tour, un autre effet de la même carte s'applique (ex: DRAW_CARDS) ; jouée en
   * interruption (`CardPlayedEvent.playedAsInterrupt`, hors tour, à tout moment),
   * SEUL cet effet s'applique à la place — voir `GameState.lastPlayedCard` et la
   * logique de sélection d'effet selon le mode dans `apps/server/src/engine/cards.ts`.
   * Retire la carte visée (la plus récemment jouée, toutes piles confondues) de
   * la pile où elle se trouve et la défausse, puis fait piocher 1 carte à
   * l'interrupteur. Limite assumée : n'annule que la présence physique de la
   * carte sur la table, pas les effets déjà appliqués (points, éliminations...)
   * qu'elle a pu déclencher entre-temps — non généralisable proprement dans un
   * moteur event-sourced à sens unique.
   */
  | { type: "CANCEL_LAST_PLAYED_CARD" }
  /**
   * Marqueur passif (ex: Rire démoniaque) : tant que cette carte est dans la pile
   * personnelle d'un joueur (posée devant lui), il pioche 1 carte à chaque fois
   * qu'un joueur (n'importe lequel) se fait éliminer — vérifié de façon centrale
   * après CHAQUE event dans `processEvent` (voir `apps/server/src/engine/index.ts`),
   * pas seulement après CARD_PLAYED, pour couvrir aussi les éliminations différées
   * (TURN_ENDED/danger) et les votes.
   */
  | { type: "DRAW_ON_ANY_ELIMINATION" }
  /** Tous les joueurs actuellement en jeu (non éliminés) gagnent la partie ensemble (ex: Câlin de groupe). */
  | { type: "WIN_ALL_ALIVE_PLAYERS" }
  /**
   * Marqueur passif (ex: Pioche verrouillée !) : tant que cette carte est posée
   * devant un joueur, plus personne ne peut piocher (toute pioche, quelle que
   * soit sa source, ramène 0 carte — voir `isDrawPileLocked`/`drawCards` dans
   * `apps/server/src/engine/state.ts`). Si un joueur se retrouve avec une main
   * vide à l'issue de la pioche de son tour, il est immédiatement éliminé (voir
   * la boucle dédiée sur l'event CARD_DRAWN dans `apps/server/src/engine/index.ts`).
   */
  | { type: "LOCK_DRAW_PILE" }
  /**
   * Marqueur passif (ex: Pingouins) : tant que cette carte est posée devant un
   * joueur, il peut — au début de SON tour, au plus une fois par tour — voler 1
   * carte posée devant un autre joueur, via l'event dédié `STEAL_PLAYED_CARD`
   * (action optionnelle du joueur, pas une résolution automatique). Voir
   * `GameState.stolenThisTurn` et `stealPlayedCard()` dans `state.ts`.
   */
  | { type: "STEAL_ON_TURN_START" }
  /**
   * Marqueur passif (ex: Patate chaude) : le joueur qui a cette carte devant lui
   * DOIT la passer au joueur suivant (event dédié `PASS_HOT_POTATO`, destinataire
   * déterministe : pas de choix) avant de jouer une carte à son tour. S'il essaie
   * de jouer une carte alors qu'il la porte encore, il est immédiatement éliminé
   * à la place (voir la vérification en tête de `playCard()` dans `cards.ts`).
   */
  | { type: "MUST_PASS_BEFORE_PLAYING" }
  /**
   * Marqueur passif (ex: Dinosaure) : tant que cette carte est posée devant un
   * joueur, personne d'autre ne peut lui placer une carte devant lui (Dragon,
   * Réforme des retraites, Patate chaude...) — la tentative est refusée
   * (`TARGET_PROTECTED`), le joueur ciblant doit choisir quelqu'un d'autre.
   * Portée volontairement limitée : ne protège que contre le placement direct
   * d'une carte jouée avec PLACE_IN_FRONT_OF_TARGET, pas contre un déplacement
   * ultérieur (ex: Bouclier qui redirige une carte déjà en jeu) — cas non
   * couvert, jugé trop marginal pour la complexité que ça demanderait.
   * N'affecte jamais les propres cartes du porteur, qui continue de jouer
   * normalement (elles se posent devant lui comme d'habitude).
   */
  | { type: "BLOCK_INCOMING_PLACEMENT" }
  /**
   * (Politique) Tous les joueurs remélangent leur main dans la pioche puis
   * tirent `count` cartes. Nécessite de l'aléatoire (mélange) : le moteur pur
   * ne mélange jamais lui-même — voir `CardPlayedEvent.shuffledDrawPileOrder`,
   * calculé côté service AVANT de construire l'event (même principe que
   * `GameStartedEvent.deck`).
   */
  | { type: "RESHUFFLE_ALL_HANDS_AND_REDRAW"; count: number }
  /**
   * (Politique) La carte jouée part directement à la défausse commune au lieu
   * du placement par défaut devant son auteur — remplace la logique de
   * placement habituelle de `playCard()`, ne s'ajoute pas à la boucle d'effets.
   */
  | { type: "DISCARD_SELF" }
  /**
   * Carte réactive (ex: Enfoiré !) : jouable uniquement juste après qu'un seul
   * joueur ait gagné la partie (`GameState.phase === "ended"`, `winnerIds`
   * réduit à 1 joueur) sans avoir éliminé le porteur. Élimine le vainqueur ET
   * le porteur. Si ≥2 joueurs restent en jeu après ça, la partie reprend
   * (`phase` repasse à `"playing"`) ; sinon elle se termine (vainqueur unique
   * restant, ou personne). Contourne spécifiquement le court-circuit
   * `phase === "ended"` de `processEvent()` — seule carte à le faire. Limite
   * assumée : ne gère qu'une victoire à 1 seul vainqueur (pas Câlin de groupe,
   * "un joueur" au singulier dans le texte) ; ne force pas de nouvelle pioche
   * pour le joueur dont c'est le tour après reprise.
   */
  | { type: "REACT_TO_OTHER_PLAYER_VICTORY" }
  /**
   * (Finito) Marqueur différé : à la fin du PROCHAIN tour du porteur (pas la fin
   * du tour en cours où elle est jouée), élimine tous les joueurs en jeu, sans
   * exception (voir `GameState.pendingFinito`, `scheduleFinito`/`checkFinito`
   * dans `apps/server/src/engine/state.ts`).
   */
  | { type: "SCHEDULE_ELIMINATE_ALL_NEXT_TURN_END" }
  /**
   * (Ninjas) Vole 1 carte tirée au hasard dans la main de `targetPlayerId` (voir
   * `CardPlayedEvent.stolenCardId`, calculé côté service) et la joue
   * immédiatement pour le compte du joueur qui a joué Ninjas — placement par
   * défaut + effets non-interactifs de cette carte volée s'appliquent tel
   * quel. Limite assumée : si la carte volée nécessite elle-même un joueur
   * cible (ex: Dragon), c'est `targetPlayerId` (celui visé par Ninjas) qui est
   * réutilisé par défaut, faute de second choix possible dans le texte "vous
   * devez la jouer immédiatement". Absent de la main de la cible → rien ne se
   * passe (main vide, rien à voler).
   */
  | { type: "STEAL_RANDOM_CARD_AND_FORCE_PLAY" }
  /**
   * (Foire aux bombes) Tous les joueurs révèlent les cartes "Bombe" de leur main
   * et les placent face visible devant eux (pas les autres cartes). Si le total
   * de Bombes sur la table atteint `threshold` (4, même seuil que l'explosion
   * normale via `CHECK_BOARD_ELIMINATION`), le joueur qui a joué cette carte
   * gagne immédiatement la partie ; sinon rien d'autre ne se passe (les Bombes
   * restent révélées).
   */
  | { type: "REVEAL_BOMBS_AND_WIN_IF_ENOUGH"; threshold: number }
  /**
   * (Gilet jaune) Marqueur passif, vérifié au début du tour du porteur (dans
   * `advanceTurn`, pas `TURN_ENDED`) : si cette carte est encore devant lui
   * quand la rotation des tours arrive sur lui, elle est défaussée, son tour
   * est sauté (il ne devient jamais le joueur courant pour ce passage), et le
   * sens de rotation de la table s'inverse (`GameState.turnDirection`) à
   * partir de ce moment — voir `apps/server/src/engine/turns.ts`.
   */
  | { type: "REVERSE_DIRECTION_AND_SKIP_IF_PRESENT" }
  /**
   * (Illumination ludique) Marqueur passif : tant que cette carte est posée
   * devant un joueur, il joue 1 carte au hasard de sa main à chaque tour, sans
   * possibilité de choisir — plus de pioche-puis-choix normal. Nécessite de
   * l'aléatoire (quelle carte, et quelle cible si la carte l'exige) : entièrement
   * orchestré côté `GameService` (voir `maybeForceRandomPlay` dans
   * `apps/server/src/services/game-service.ts`), qui réutilise `playCard()`
   * telle quelle — le moteur pur ne connaît que le marqueur, jamais l'aléatoire.
   * Limite assumée, comme "Pioche verrouillée !" : si la main du porteur est
   * vide, rien ne se passe (pas d'élimination automatique généralisée).
   */
  | { type: "FORCE_RANDOM_CARD_EACH_TURN" }
  /**
   * (Bataille) Ouvre un choix simultané secret pierre/feuille/ciseaux pour
   * tous les joueurs en jeu (y compris l'auteur de la carte — le texte dit
   * "tout le monde joue", sans exception). Résolu par `submitChoice()` une
   * fois que tous ont choisi : les joueurs ayant choisi "feuille" sont
   * éliminés (règle de la carte, pas une vraie pierre-feuille-ciseaux à
   * interaction — juste une valeur fixe perdante). Voir `GameState.pendingChoice`.
   */
  | { type: "START_ROCK_PAPER_SCISSORS" }
  /**
   * (Chiffre) Ouvre un choix simultané secret (1 à 5 doigts) pour tous les
   * joueurs en jeu. Une fois tous les choix faits, si la somme totale est un
   * nombre premier, l'auteur de la carte gagne immédiatement la partie ;
   * sinon rien ne se passe. Voir `GameState.pendingChoice`.
   */
  | { type: "START_FINGER_COUNT_CHALLENGE" }
  /**
   * (Nez à nez / Pied de nez) Lance un décompte synchronisé de `seconds`
   * secondes après lequel chaque joueur en jeu est éliminé ou non selon qu'il
   * touche encore son nez à cet instant (`GameState.pendingNoseCountdown.touching`,
   * mis à jour librement pendant le décompte via l'event `NOSE_TOUCH_TOGGLED`).
   * `eliminateIfTouching: false` (Nez à nez) élimine ceux qui NE touchent PAS
   * leur nez au terme du décompte ; `true` (Pied de nez) élimine ceux qui
   * touchent ENCORE leur nez, porteur inclus (le texte dit "tout joueur", pas
   * "tout autre joueur"). Contrairement aux votes/choix (résolus dès que tous
   * les joueurs éligibles ont répondu), la résolution est déclenchée par un
   * minuteur côté `GameService` (le moteur pur ne connaît jamais l'horloge),
   * via l'event `NOSE_COUNTDOWN_RESOLVED`.
   */
  | { type: "START_NOSE_COUNTDOWN"; seconds: number; eliminateIfTouching: boolean }
  /**
   * (Du chocolat !) Lance une course au clic : chaque joueur en jeu (porteur
   * inclus) clique un bouton "Poser sa main" dès qu'il le souhaite ; le
   * serveur horodate l'ordre d'arrivée (`GameState.pendingHandSlap.order`).
   * Résolu une fois que tout le monde a cliqué : `firstLoses` élimine le
   * premier, `lastLoses` élimine le dernier, `onlyFirstSurvives` élimine tout
   * le monde SAUF le premier. Même principe de confiance que le décompte Nez
   * à nez/Pied de nez (ordre décidé par le serveur à la réception réseau,
   * pas de synchro ultra-précise nécessaire pour un jeu entre amis).
   */
  | { type: "START_HAND_SLAP"; mode: "firstLoses" | "lastLoses" | "onlyFirstSurvives" }
  /**
   * (Vous avez gagné !) Au moment de jouer la carte, le joueur choisit entre
   * tenter de gagner (si la condition tient) ou simplement poser la carte
   * pour `fallbackPoints` (voir `CardPlayedEvent.claimWin`, même principe de
   * choix au moment du jeu qu'Embuscade de chatons/`playedAsInterrupt`).
   * `claimWin` non fourni ou `false` -> ADD_POINTS `fallbackPoints`, jamais
   * de vérification. `claimWin: true` -> vérifie/vote selon `condition` :
   * - `bombsOnBoard`/`noStarCardInAnyHand` : vérifiable par le serveur lui-même
   *   (déjà dans l'état du jeu), pas de vote — victoire immédiate ou rien.
   * - `socialVote` : condition non vérifiable serveur (anniversaire, taille,
   *   composition du groupe...) — ouvre un vote à majorité des AUTRES joueurs
   *   (mode `winClaim` de `PendingVote`, même principe que Gâteau ou Tombeau) ;
   *   majorité "oui" -> victoire immédiate, sinon rien ne se passe (pas de
   *   pénalité pour une fausse tentative, le texte ne le prévoit pas).
   */
  | {
      type: "WIN_IF_CONDITION_ELSE_POINTS";
      condition:
        | { kind: "bombsOnBoard"; threshold: number }
        | { kind: "noStarCardInAnyHand" }
        | { kind: "socialVote"; description: string };
      fallbackPoints: number;
    }
  /**
   * (À moi ! À qui ? À moi ! À vous ?) Échange de place (position dans l'ordre
   * des tours) ET de main avec le joueur ciblé — combiné à `PLAY_AGAIN` sur la
   * même carte pour "rejouez immédiatement depuis votre nouvelle place". Les
   * piles de cartes posées (`playedCards`) restent attachées à chaque joueur,
   * PAS à la position : le texte dit explicitement "laissez les cartes face
   * visible là où elles sont", et rien dans le moteur ne référence de pile par
   * position plutôt que par identité — portée volontairement limitée à
   * l'échange de place + main, cohérent avec cette clarification du texte.
   */
  | { type: "SWAP_POSITION_AND_HAND" };

export type Card = {
  id: CardId;
  name: string;
  rarity: CardRarity;
  /** Texte d'instruction complet tel qu'imprimé sur la carte. */
  text: string;
  /** Vide = effet manuel : le moteur affiche `text` et attend une confirmation des joueurs. */
  effects: AutomatedEffect[];
};

/**
 * Une entrée du catalogue des cartes du jeu (`GET /api/cards`), pour affichage
 * dans une modale/page de consultation — pas un `Card` jouable (pas d'`id`
 * d'instance individuelle) : une entrée par nom+texte distinct, avec le nombre
 * d'exemplaires regroupés (ex: 6 "Bombe" identiques -> 1 entrée, `quantity: 6`).
 */
export type CardCatalogEntry = {
  name: string;
  rarity: CardRarity;
  text: string;
  quantity: number;
  /** `true` si le moteur résout cette carte automatiquement, `false` si elle reste manuelle (texte + confirmation des joueurs). */
  automated: boolean;
};

export type Player = {
  id: PlayerId;
  name: string;
  hand: Card[];
  /** Cartes jouées par ce joueur, visibles sur la table jusqu'à la fin de la partie (même après élimination). */
  playedCards: Card[];
  isEliminated: boolean;
  points: number;
  /** Nombre de tours restant à sauter (décrémenté à chaque tour qui aurait dû être le sien). */
  skipTurns: number;
};

export type GamePhase = "lobby" | "playing" | "ended";

/**
 * Vote simultané en cours (ex: carte Cadeaux). Bloque la fin de tour jusqu'à
 * résolution. Le "secret" du vote est une convention côté UI (ne pas afficher
 * les votes des autres avant révélation) — pas un secret cryptographique
 * côté serveur, ce qui est amplement suffisant pour un jeu entre amis.
 */
export type PendingVote =
  | {
      mode: "simultaneous";
      cardId: CardId;
      /** Auteur de la carte — cible de l'outcome `GIVE_CARD_TO_ACTOR` (ex: "Cadeaux" vides). */
      actorPlayerId: PlayerId;
      eligiblePlayerIds: PlayerId[];
      votes: Partial<Record<PlayerId, VoteChoice>>;
      onYes: VoteOutcome;
      onNo: VoteOutcome;
    }
  | {
      /** "Gâteau ou Tombeau" : tous les autres joueurs votent, l'auteur de la carte non. */
      mode: "cakeOrGrave";
      cardId: CardId;
      eligiblePlayerIds: PlayerId[];
      votes: Partial<Record<PlayerId, VoteChoice>>;
      actorPlayerId: PlayerId;
    }
  | {
      /** "La mort ou Tchi-tchi" : tous les joueurs en jeu votent, y compris l'auteur. */
      mode: "deathOrTchi";
      cardId: CardId;
      eligiblePlayerIds: PlayerId[];
      votes: Partial<Record<PlayerId, VoteChoice>>;
    }
  | {
      /**
       * Dénonciation : un joueur estime qu'un autre (ou lui-même — l'auto-
       * dénonciation est permise) n'a pas respecté une carte manuelle (texte
       * affiché, pas d'automatisation) — ex: n'a pas fait le geste demandé, a
       * dit un mot interdit... TOUS les joueurs en jeu votent, y compris le
       * dénoncé lui-même. Majorité stricte de "oui" -> éliminé ; égalité ou
       * majorité de "non" -> rien ne se passe. Pas liée à une carte précise
       * (`cardId` absent), déclenchable à tout moment par n'importe quel
       * joueur, sans rapport avec l'ordre des tours.
       */
      mode: "denunciation";
      accuserId: PlayerId;
      accusedId: PlayerId;
      /** Raison libre saisie par l'accusateur (ex: "n'a pas fait le geste demandé par la carte X"), affichée aux votants. */
      reason: string;
      eligiblePlayerIds: PlayerId[];
      votes: Partial<Record<PlayerId, VoteChoice>>;
    }
  | {
      /**
       * "Vous avez gagné !" (variantes à condition non vérifiable par le
       * serveur — anniversaire, taille, composition du groupe...) : tous les
       * AUTRES joueurs votent sur la véracité de la condition, l'auteur de la
       * carte ne vote pas — même principe que "Gâteau ou Tombeau". Majorité
       * stricte de "oui" -> l'auteur gagne immédiatement ; égalité ou
       * majorité de "non" -> rien ne se passe (voir WIN_IF_CONDITION_ELSE_POINTS).
       */
      mode: "winClaim";
      cardId: CardId;
      actorPlayerId: PlayerId;
      /** Texte de la condition à vérifier, affiché aux votants (ex: "c'est le mois de son anniversaire"). */
      description: string;
      eligiblePlayerIds: PlayerId[];
      votes: Partial<Record<PlayerId, VoteChoice>>;
    };

/**
 * Course au clic en cours ("Du chocolat !", voir `START_HAND_SLAP`). `order`
 * accumule les joueurs dans l'ordre où ils ont cliqué "Poser sa main" ;
 * résolu dès que tous les joueurs éligibles y figurent.
 */
export type PendingHandSlap = {
  cardId: CardId;
  holderId: PlayerId;
  mode: "firstLoses" | "lastLoses" | "onlyFirstSurvives";
  eligiblePlayerIds: PlayerId[];
  order: PlayerId[];
};

/**
 * Choix simultané secret à PLUSIEURS options (contrairement à `PendingVote`,
 * toujours oui/non) — ex: Bataille (pierre/feuille/ciseaux), Chiffre (1 à 5
 * doigts). Séparé de `PendingVote` car la forme du choix diffère vraiment
 * (valeur libre, pas juste oui/non) ; même convention de secret côté UI.
 */
export type PendingChoice =
  | {
      /** "Bataille" : tous les joueurs en jeu choisissent, ceux qui ont choisi "feuille" sont éliminés. */
      mode: "rockPaperScissors";
      cardId: CardId;
      eligiblePlayerIds: PlayerId[];
      choices: Partial<Record<PlayerId, "pierre" | "feuille" | "ciseaux">>;
    }
  | {
      /** "Chiffre" : tous les joueurs en jeu montrent 1 à 5 doigts ; si la somme est première, l'auteur de la carte gagne. */
      mode: "fingerCount";
      cardId: CardId;
      actorPlayerId: PlayerId;
      eligiblePlayerIds: PlayerId[];
      choices: Partial<Record<PlayerId, 1 | 2 | 3 | 4 | 5>>;
    };

/**
 * Décompte synchronisé en cours (Nez à nez / Pied de nez) — voir
 * `START_NOSE_COUNTDOWN`. `touching` reflète l'état en direct de chaque
 * joueur (bouton "nez" pressé ou non), librement modifiable jusqu'à la
 * résolution ; absent d'une entrée = pas encore touché (traité comme `false`
 * à la résolution).
 */
export type PendingNoseCountdown = {
  cardId: CardId;
  holderId: PlayerId;
  seconds: number;
  eliminateIfTouching: boolean;
  eligiblePlayerIds: PlayerId[];
  touching: Partial<Record<PlayerId, boolean>>;
};

export type GameState = {
  roomId: RoomId;
  phase: GamePhase;
  /** Ordre de tour de jeu. */
  players: Player[];
  currentPlayerId: PlayerId | null;
  drawPile: Card[];
  /** Défausse commune (distincte des piles personnelles `Player.playedCards`). */
  discardPile: Card[];
  /**
   * Vainqueur(s) de la partie une fois `phase === "ended"` — un tableau plutôt
   * qu'un id unique pour supporter les victoires collectives (ex: Câlin de
   * groupe, `WIN_ALL_ALIVE_PLAYERS`). `null` tant que la partie n'est pas
   * terminée, ou si elle s'est terminée sans aucun vainqueur (ex: explosion de
   * bombes qui élimine tout le monde d'un coup).
   */
  winnerIds: PlayerId[] | null;
  /** Score à atteindre pour gagner par points (modifiable par des cartes comme "Super Points"). */
  pointsToWin: number;
  pendingVote: PendingVote | null;
  /**
   * Identifiants des joueurs éliminés ensemble par le dernier event d'élimination
   * groupée (≥2 joueurs, partie toujours en cours) — fenêtre de réaction pour
   * "Gros nul !" (`REACT_TO_GROUP_ELIMINATION`). `null` si aucune fenêtre ouverte
   * ou si elle vient de se refermer (tour suivant, autre carte jouée).
   */
  lastEliminationBatch: PlayerId[] | null;
  /**
   * Dernière carte jouée par n'importe qui, toujours en jeu sur la table (dans
   * `playedCards` de `holderId`) — cible potentielle de "Embuscade de chatons"
   * (`CANCEL_LAST_PLAYED_CARD`). Contrairement à `lastEliminationBatch`, aucune
   * fenêtre de temps ne se referme : le texte de la carte dit "à tout moment".
   * `null` uniquement avant la toute première carte jouée de la partie.
   */
  lastPlayedCard: { cardId: CardId; holderId: PlayerId } | null;
  /**
   * Vrai si le vol optionnel de "Pingouins" (`STEAL_ON_TURN_START`) a déjà été
   * utilisé pendant le tour en cours — au plus 1 vol par tour, par n'importe quel
   * porteur. Remis à `false` à chaque changement de joueur courant (`advanceTurn`).
   */
  stolenThisTurn: boolean;
  /**
   * Vrai si le joueur courant a déjà joué sa carte normale du tour (règle
   * officielle : 1 carte par tour, sauf exception explicite comme "Bombe"/
   * "Tricheur" qui accordent `PLAY_AGAIN` — remis à `false` dans ce cas
   * précis pour autoriser une carte de plus). Bloque toute tentative de
   * carte normale supplémentaire (`ALREADY_PLAYED_THIS_TURN`) ; ne concerne
   * jamais les cartes réactives hors tour (Vie supplémentaire, Gros nul !...)
   * ni les interruptions (Embuscade de chatons). Remis à `false` à chaque
   * changement de joueur courant (`advanceTurn`), comme `stolenThisTurn`.
   */
  hasPlayedThisTurn: boolean;
  /**
   * Marqueur différé "Finito" (`SCHEDULE_ELIMINATE_ALL_NEXT_TURN_END`) : `primed`
   * passe à `true` la première fois que le tour du porteur se termine après avoir
   * joué la carte (pas d'élimination ce coup-ci) ; la fois suivante, tout le monde
   * est éliminé et ce champ repasse à `null`. `null` si aucune Finito en attente.
   */
  pendingFinito: { holderId: PlayerId; primed: boolean } | null;
  /**
   * Sens de rotation des tours : `1` = ordre normal de `players`, `-1` = inversé
   * (voir "Gilet jaune", `REVERSE_DIRECTION_AND_SKIP_IF_PRESENT`). Peut s'inverser
   * plusieurs fois au cours d'une partie si plusieurs Gilets jaunes se succèdent.
   */
  turnDirection: 1 | -1;
  /** Choix simultané à options multiples en cours (Bataille, Chiffre) — voir `PendingChoice`. Bloque la fin de tour comme `pendingVote`. */
  pendingChoice: PendingChoice | null;
  /** Décompte synchronisé en cours (Nez à nez, Pied de nez) — voir `PendingNoseCountdown`. Bloque la fin de tour comme `pendingVote`/`pendingChoice`. */
  pendingNoseCountdown: PendingNoseCountdown | null;
  /** Course au clic en cours (Du chocolat !) — voir `PendingHandSlap`. Bloque la fin de tour comme les autres `pending*`. */
  pendingHandSlap: PendingHandSlap | null;
  /**
   * Id de la dernière carte manuelle "réflexe instantané" jouée (ex: Index
   * réflexe, Nez à nez, Pied de nez) tant qu'elle reste dénonçable — contrairement
   * aux règles manuelles permanentes (Moi, Toi, Zombies...), le texte de ces
   * cartes se constate au moment même où elles sont jouées, pas plusieurs tours
   * après. Remis à `null` à la fin du tour (`TURN_ENDED`), même principe que
   * `lastEliminationBatch`.
   */
  openReflexCardId: CardId | null;
};
