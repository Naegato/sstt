import path from "node:path";
import type { Card, CardRarity } from "@card-game/shared-types";

const CSV_PATH = path.join(import.meta.dir, "../../../../assets/cards/cards.csv");

/** Parseur CSV minimal (RFC4180 : champs entre guillemets, virgules et guillemets échappés ""). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

type CatalogRow = {
  nom: string;
  type: CardRarity;
  description: string;
  commentaire: string;
  fichierImage: string;
};

let cachedCatalog: CatalogRow[] | null = null;

async function loadCatalog(): Promise<CatalogRow[]> {
  if (cachedCatalog) return cachedCatalog;

  const text = await Bun.file(CSV_PATH).text();
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const [, ...rows] = lines; // ignore l'en-tête

  cachedCatalog = rows.map((line) => {
    const [nom, type, description, commentaire, fichierImage] = parseCsvLine(line);
    return {
      nom: nom ?? "",
      type: (type ?? "normale") as CardRarity,
      description: description ?? "",
      commentaire: commentaire ?? "",
      fichierImage: fichierImage ?? "",
    };
  });

  return cachedCatalog;
}

/** id stable dérivé du fichier image (déjà unique, humainement lisible). */
function idFromRow(row: CatalogRow): string {
  const base = row.fichierImage.split("/").pop() ?? row.nom;
  return base.replace(/\.[^.]+$/, "");
}

/**
 * Cartes automatisées : la majorité des 90 cartes du jeu ont des effets
 * sociaux/conditionnels (déclencheurs différés, état du plateau, "donnez X
 * cartes"...) qui dépassent le vocabulaire d'effets actuel du moteur — elles
 * restent donc "manuelles" (texte affiché, résolution par les joueurs), ce que
 * le moteur gère déjà nativement. Familles automatisées à ce jour :
 * - "J'ai perdu" : élimination immédiate, correspondance exacte.
 * - "Points"/"Super Points" : +points, victoire au seuil (modifiable).
 * - "Bombe" (normale + étoile) : rejoue un tour, explosion si 4+ bombes visibles.
 * - Dragon/Laser/Trou noir/Pluie de flèches : élimination différée (fin de tour du porteur).
 * - Bouclier/Science/Vaisseau spatial/Supervitesse : redirigent la menace correspondante, sinon piochent 2.
 */
const DANGER_CARD: Card["effects"] = [
  { type: "PLACE_IN_FRONT_OF_TARGET" },
  { type: "ELIMINATE_AT_END_OF_TURN_IF_PRESENT" },
];

const AUTOMATED_EFFECTS: Record<string, Card["effects"]> = {
  "J'ai perdu": [{ type: "ELIMINATE_SELF" }],
  Points: [{ type: "ADD_POINTS", amount: 8 }],
  // SET_POINTS_TO_WIN doit être appliqué AVANT ADD_POINTS : sinon la vérification
  // de victoire dans addPoints() se ferait contre l'ancien seuil (15) et
  // déclarerait une victoire prématurée avant même que le seuil soit relevé.
  "Super Points": [
    { type: "SET_POINTS_TO_WIN", value: 100 },
    { type: "ADD_POINTS", amount: 90 },
  ],
  Bombe: [{ type: "PLAY_AGAIN" }, { type: "CHECK_BOARD_ELIMINATION", cardName: "Bombe", threshold: 4 }],

  Dragon: DANGER_CARD,
  Laser: DANGER_CARD,
  "Trou noir": DANGER_CARD,
  "Pluie de flèches": DANGER_CARD,

  Bouclier: [{ type: "REDIRECT_NAMED_CARD_OR_DRAW", matchNames: ["Dragon", "Pluie de flèches"], drawCountIfNone: 2 }],
  Science: [{ type: "REDIRECT_NAMED_CARD_OR_DRAW", matchNames: ["Dragon", "Trou noir"], drawCountIfNone: 2 }],
  "Vaisseau spatial": [
    { type: "REDIRECT_NAMED_CARD_OR_DRAW", matchNames: ["Laser", "Trou noir"], drawCountIfNone: 2 },
  ],
  Supervitesse: [
    { type: "REDIRECT_NAMED_CARD_OR_DRAW", matchNames: ["Laser", "Pluie de flèches"], drawCountIfNone: 2 },
  ],

  "Conclusion dramatique": [{ type: "WIN_IF_ALIVE_COUNT", count: 2 }],
  // Place devant un AUTRE joueur, mais c'est bien l'auteur de la carte qui saute ses tours.
  "Réforme des retraites": [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "SKIP_OWN_NEXT_TURNS", count: 2 }],

  Tricheur: [{ type: "DRAW_CARDS", count: 2 }, { type: "PLAY_AGAIN" }],
  "Quatre à la suite": [{ type: "DRAW_CARDS", count: 4 }, { type: "GIVE_CARDS_TO_TARGET", count: 2 }],

  // Réactive : jouable hors tour, seulement quand isEliminated === true (voir cards.ts).
  "Vie supplémentaire": [{ type: "REACT_TO_OWN_ELIMINATION" }],

  "Gâteau ou Tombeau": [{ type: "START_MAJORITY_VOTE_CAKE_OR_GRAVE" }],
  "La mort ou Tchi-tchi ?": [{ type: "START_MAJORITY_VOTE_DEATH_OR_TCHI" }],

  // Réactive : jouable hors tour, seulement juste après une élimination groupée
  // (voir GameState.lastEliminationBatch / REACT_TO_GROUP_ELIMINATION dans cards.ts).
  "Gros nul !": [{ type: "REACT_TO_GROUP_ELIMINATION" }],

  // Double usage : jouée normalement à son tour -> pioche 3 (dessus de la pioche) ;
  // jouée en interruption (CardPlayedEvent.playedAsInterrupt) à tout moment -> annule
  // + défausse la dernière carte jouée par n'importe qui, pioche 1 en récompense.
  // Un seul des deux effets s'applique selon le mode (voir cards.ts).
  "Embuscade de chatons": [{ type: "DRAW_CARDS", count: 3 }, { type: "CANCEL_LAST_PLAYED_CARD" }],

  // Marqueur passif : tant que posée devant son propriétaire, pioche 1 carte à
  // chaque élimination survenue dans la partie (voir DRAW_ON_ANY_ELIMINATION,
  // vérifié de façon centrale dans apps/server/src/engine/index.ts).
  "Rire démoniaque": [{ type: "DRAW_ON_ANY_ELIMINATION" }],

  "Câlin de groupe": [{ type: "WIN_ALL_ALIVE_PLAYERS" }],

  // Marqueur passif : tant que posée en jeu, bloque toute pioche (voir
  // LOCK_DRAW_PILE / isDrawPileLocked dans state.ts, et la boucle d'élimination
  // sur CARD_DRAWN dans apps/server/src/engine/index.ts).
  "Pioche verrouillée !": [{ type: "LOCK_DRAW_PILE" }],

  // Marqueur passif : ouvre l'action optionnelle STEAL_PLAYED_CARD au début du
  // tour du porteur (voir stealPlayedCard()/GameState.stolenThisTurn dans state.ts).
  Pingouins: [{ type: "STEAL_ON_TURN_START" }],

  // Placée devant un joueur choisi ; le porteur DOIT la passer (PASS_HOT_POTATO)
  // avant de jouer une carte à son tour, sinon il est éliminé (voir cards.ts).
  "Patate chaude": [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "MUST_PASS_BEFORE_PLAYING" }],

  // Marqueur passif : protège le porteur contre tout placement ciblé par un
  // autre joueur (voir BLOCK_INCOMING_PLACEMENT / isProtectedByDinosaur dans state.ts).
  Dinosaure: [{ type: "BLOCK_INCOMING_PLACEMENT" }],

  // Nécessite de l'aléatoire (mélange) : voir RESHUFFLE_ALL_HANDS_AND_REDRAW,
  // GameService.playCard() calcule shuffledDrawPileOrder avant de dispatcher.
  // DISCARD_SELF : part directement à la défausse (jamais posée devant l'auteur).
  Politique: [
    { type: "RESHUFFLE_ALL_HANDS_AND_REDRAW", count: 2 },
    { type: "PLAY_AGAIN" },
    { type: "DISCARD_SELF" },
  ],

  // Réactive : jouable uniquement juste après qu'un seul joueur ait gagné la
  // partie sans éliminer le porteur (voir REACT_TO_OTHER_PLAYER_VICTORY dans
  // cards.ts/index.ts — seule carte à contourner le court-circuit "partie terminée").
  "Enfoiré !": [{ type: "REACT_TO_OTHER_PLAYER_VICTORY" }],

  // Délai d'1 tour avant de déclencher (voir scheduleFinito/checkFinito dans state.ts) :
  // pas immédiat comme Dragon (ELIMINATE_AT_END_OF_TURN_IF_PRESENT).
  Finito: [{ type: "SCHEDULE_ELIMINATE_ALL_NEXT_TURN_END" }],

  // Nécessite de l'aléatoire (carte volée au hasard) : voir CardPlayedEvent.stolenCardId,
  // calculé côté GameService.playCard() avant de dispatcher.
  Ninjas: [{ type: "STEAL_RANDOM_CARD_AND_FORCE_PLAY" }],

  // Même seuil que l'explosion normale de Bombe (CHECK_BOARD_ELIMINATION, threshold: 4).
  "Foire aux bombes": [{ type: "REVEAL_BOMBS_AND_WIN_IF_ENOUGH", threshold: 4 }],

  // Vérifié au début du tour du porteur, dans advanceTurn() (turns.ts) — pas
  // à la fin de tour comme Dragon/Finito.
  "Gilet jaune": [{ type: "PLACE_IN_FRONT_OF_TARGET" }, { type: "REVERSE_DIRECTION_AND_SKIP_IF_PRESENT" }],

  // Aléatoire (carte + cible) entièrement géré côté GameService (maybeForceRandomPlay).
  "Illumination ludique": [
    { type: "PLACE_IN_FRONT_OF_TARGET" },
    { type: "ADD_POINTS", amount: 2 },
    { type: "FORCE_RANDOM_CARD_EACH_TURN" },
  ],
};

/**
 * "Cadeaux" existe en 3 variantes qui partagent le même nom mais ont des règles
 * de résolution différentes (vides/chatons/serpents) — impossible à distinguer
 * par nom seul, on détecte la variante via un fragment du texte de la carte.
 */
function resolveCadeauxEffects(description: string): Card["effects"] {
  if (description.includes("vides")) {
    return [{ type: "START_SIMULTANEOUS_VOTE", onYes: "LOSE_CARD", onNo: "NOTHING" }];
  }
  if (description.includes("chatons")) {
    return [{ type: "START_SIMULTANEOUS_VOTE", onYes: "NOTHING", onNo: "ELIMINATE" }];
  }
  if (description.includes("serpents")) {
    return [{ type: "START_SIMULTANEOUS_VOTE", onYes: "ELIMINATE", onNo: "NOTHING" }];
  }
  return [];
}

function toCard(row: CatalogRow): Card {
  const id = idFromRow(row);
  const effects = row.nom === "Cadeaux" ? resolveCadeauxEffects(row.description) : (AUTOMATED_EFFECTS[row.nom] ?? []);
  return {
    id,
    name: row.nom,
    rarity: row.type,
    text: row.description,
    effects,
  };
}

/**
 * Deck jouable en v1 : cartes normale + étoile uniquement. L'extension Chaos et
 * les cartes vierges sont hors scope v1 (voir CLAUDE.md §2.6).
 */
export async function loadPlayableDeck(): Promise<Card[]> {
  const catalog = await loadCatalog();
  return catalog.filter((row) => row.type === "normale" || row.type === "etoile").map(toCard);
}
