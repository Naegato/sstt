export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 17;
export const STARTING_HAND_SIZE = 2;
/** Score à atteindre pour les cartes à condition de victoire par points (ex. "Vous avez gagné !"). */
export const WINNING_POINTS = 15;

/**
 * Décompte synchronisé (Nez à nez, Pied de nez) : `GameState.pendingNoseCountdown.seconds`
 * représente le nombre de "chiffres" du compte (3 pour Nez à nez, 4 pour Pied
 * de nez), pas des secondes réelles. Deux phases, partagées entre le minuteur
 * serveur (`GameService.scheduleNoseCountdownResolution`) et l'affichage
 * client (`NoseCountdownPanel`) pour rester synchronisés :
 * 1. "Attention" : la carte reste affichée sans décompte pendant
 *    `NOSE_COUNTDOWN_WARNING_MS`, le temps de la lire.
 * 2. Décompte : un chiffre toutes les `NOSE_COUNTDOWN_TICK_MS`, jusqu'à `seconds`.
 * Constantes réunies ici pour pouvoir équilibrer le rythme en un seul endroit
 * (retour utilisateur : "ça se fait tout d'un coup").
 */
export const NOSE_COUNTDOWN_WARNING_MS = 3000;
export const NOSE_COUNTDOWN_TICK_MS = 2000;

/**
 * Annonce d'une carte jouée : le client retarde l'application du nouvel état
 * reçu (`game:state-update`) le temps d'afficher la carte en grand (face
 * visible avec nom/texte, ou dos de carte si elle se pose face cachée) avant
 * de révéler l'effet — sinon des cartes comme "Câlin de groupe" (victoire
 * immédiate) passent trop vite pour que les joueurs comprennent ce qu'il
 * vient de se passer. Une seule constante à ajuster pour équilibrer le rythme.
 */
export const CARD_ANNOUNCEMENT_MS = 2200;

/**
 * Révélation "qui a voté/choisi quoi" (Bataille, Chiffre, Cadeaux...) : même
 * principe que CARD_ANNOUNCEMENT_MS — affichée après résolution, avant
 * d'appliquer le nouvel état, pour laisser le temps de voir le résultat
 * (demande explicite de l'utilisateur, "voir qui a voté quoi").
 */
export const CHOICE_REVEAL_MS = 2800;
