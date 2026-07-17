# CLAUDE.md

> Ce fichier complète `guidelines.md` (source de vérité technique/architecture, à lire en premier et à ne jamais contredire). Ici : le contexte produit du jeu, les décisions de design prises avec l'utilisateur, et la méthode de travail à suivre.

---

## 1. Le jeu

Projet perso : clone numérique de **"Personne n'a testé ce truc ?!"** (Iello, FR), version localisée de **"We Didn't Playtest This At All"** (Asmadi Games, designer Chris Cieslik). Party game de cartes chaotique et absurde, sans équilibrage volontaire.

### Règles officielles (rulebook Iello FR)

- **But du jeu** : gagner la partie. Un joueur éliminé ne participe plus et ne peut plus gagner. Si tous les joueurs sauf un sont éliminés, ce dernier gagne.
- **Mise en place** : mélanger le deck, distribuer 2 cartes à chaque joueur, former une pioche avec le reste, déterminer le premier joueur au hasard.
- **Tour de jeu** : le joueur actif pioche 1 carte, puis joue 1 carte de sa main en suivant ses instructions. Le tour passe ensuite au joueur suivant (sens horaire / ordre de la table).
- **Cartes jouées** : elles restent visibles sur la table jusqu'à la fin de la partie, même si le joueur qui les a jouées est éliminé entre-temps (persistance de l'historique visible).
- **Cartes Étoile** : nettement plus fortes que les cartes normales. La distribution du deck doit garantir des chances à peu près égales pour chaque joueur d'en piocher une au cours de la partie.
- **Élimination immédiate** si un joueur :
  - ne peut jouer aucune carte de sa main à son tour,
  - oublie d'effectuer une action qu'il devait faire,
  - ne peut pas satisfaire une demande imposée par une carte jouée sur lui.
- **Extension Chaos** (hors scope v1) : deck séparé au format paysage. 1 (ou 2) cartes tirées au hasard en début de tour, en plus du tour normal.
- **Cartes vierges** (hors scope v1) : les joueurs inventent leurs propres cartes/règles.

### Exemples de cartes réelles (glanées, liste à compléter au fil du dev)

- **YOU** : tout joueur qui dit "toi/tu/ton/votre..." perd immédiatement, à partir de ce moment.
- **GO FISH** : choisir une consonne, révéler une carte au hasard dans la main d'un autre joueur ; pour chaque lettre du titre de cette carte qui correspond, désigner un joueur qui perd. Si aucune lettre ne correspond, c'est toi qui perds.
- **ZYZZL DUCK** : posée devant soi, double tous les points/dollarbucks du joueur.
- **BALM** : posée devant soi + rejouer un tour. Si 4+ baumes sur la table → tous les joueurs encore en jeu gagnent. Sinon si (baumes + bombes) ≥ 5 → tout le monde perd.
- **BOMB** : posée devant soi + rejouer un tour. Si 4+ bombes sur la table → elles explosent, tout le monde perd.
- Familles de cartes "danger" : bombes, dragons, flèches, pointeurs laser, trous noirs, duels pierre-feuille-ciseaux, duels de nombres, zombies.
- Familles de cartes "protection/objet" : vaisseaux spatiaux, science, boucliers, dinosaures, embuscade de chat.

**Le contenu complet des cartes n'est pas dans le domaine public / pas extrait intégralement.** On ajoute les cartes progressivement : recherche web ou description de l'utilisateur (qui possède le jeu physique), puis implémentation. Ne jamais inventer un texte de carte officiel — soit on a une source, soit on crée clairement une carte "maison" identifiée comme telle pour les tests.

---

## 2. Décisions de design pour la v1 (validées avec l'utilisateur)

1. **Joueurs** : 2 à 17 (comme le jeu physique). L'architecture (rooms, GameState.players, UI) doit supporter N joueurs dès le départ, pas juste 2.
2. **Moteur d'effets hybride** — décision clé, différente des exemples 1v1 simples de `guidelines.md` :
   - Chaque carte a un `effectType`.
   - **Effets automatisés** : le moteur pur applique la logique (piocher X cartes, passer un tour, échanger une main, éliminer un joueur, doubler des points, etc.). Ce sont les `SideEffect` / transitions d'état classiques du moteur pur.
   - **Effets manuels** : le moteur affiche le texte d'instruction brut et attend une confirmation des joueurs (bouton "Fait" / action déclarative). En cas de litige (le joueur n'a pas respecté la demande), les autres joueurs peuvent voter/déclarer l'élimination — c'est un événement du jeu comme un autre (`MANUAL_ACTION_CONFIRMED`, `ELIMINATION_CHALLENGED`, etc.), pas une exception au système d'event sourcing.
   - Objectif : pouvoir coder les cartes "faciles" tout de suite (piocher, passer tour, cibler un joueur, poser une carte devant soi...) et ajouter les cartes "sociales/physiques" (mimes, défis, blagues) sans bloquer l'architecture — elles utilisent juste le chemin "manuel" en attendant, ou définitivement si l'effet est intrinsèquement non-automatisable.
3. **Cartes jouées persistantes** : le `GameState` doit modéliser, par joueur, la pile de cartes posées devant lui (visible même après élimination) — ce n'est pas juste une défausse commune comme dans l'exemple `discardPile` de `guidelines.md`.
4. **Cartes Étoile** : à modéliser comme un flag/tag sur la carte (`isStarCard` ou `rarity: 'normal' | 'star'`) + une logique de distribution équilibrée dans le deck (à définir précisément à l'étape "moteur de deck").
5. **Élimination** : condition de victoire = dernier joueur non éliminé. Un joueur éliminé reste visible dans la partie (spectateur) mais sort de la rotation des tours.
6. **Hors scope v1** (backlog assumé, pas oublié) : Extension Chaos, cartes vierges/custom.

---

## 3. Adaptations du modèle de données par rapport aux exemples de `guidelines.md`

Les types d'exemple dans `guidelines.md` (§4.3, §4.4) sont pensés pour un duel 1v1 à PV/énergie. Ils servent de **patron de structure** (comment organiser `packages/shared-types`, comment typer les events, le principe de moteur pur + event sourcing) mais **pas** de modèle de données final. À adapter concrètement à l'étape shared-types :

- `Player` : pas de `health`/`energy`/`maxEnergy` par défaut — remplacer par des champs pertinents pour ce jeu (ex. `isEliminated`, `playedCards: Card[]`, ordre de tour).
- `GameEvent` union : remplacer `CARD_PLAYED` générique par des events plus riches capables de porter un `effectType` + payload variable, plus des events dédiés (`PLAYER_ELIMINATED`, `MANUAL_ACTION_CONFIRMED`, `STAR_CARD_DRAWN`, etc.).
- `GameState.players` : tableau ordonné représentant le tour de jeu (`currentPlayerId` reste valide comme concept), doit gérer proprement le skip des joueurs éliminés.
- Tout le reste (moteur pur sans I/O, event sourcing, replay, Fastify + Socket.io + Next.js, conventions de nommage, tests bun:test/Vitest, structure de dossiers) reste **tel quel** conformément à `guidelines.md`.

---

## 4. Méthode de travail

- **Étapes petites et validées une à une.** Je propose une étape concrète, on la construit, on vérifie ensemble, puis on passe à la suivante. Pas de gros blocs de code non validés.
- Pas de sur-ingénierie anticipée : on n'implémente l'extension Chaos, les cartes vierges, ou des dizaines de cartes d'un coup que si demandé. On construit large mais on remplit progressivement.
- Quand une carte nécessite un texte officiel qu'on n'a pas encore, je le demande ou le cherche sur le web avant de l'implémenter — jamais d'invention silencieuse d'un effet "officiel".
- Toute nouvelle décision de design importante prise en cours de route doit être reportée dans ce fichier (section 2 ou 3) pour rester la mémoire vivante du projet.

---

## 5. Roadmap indicative (à affiner ensemble, pas gravée dans le marbre)

1. Scaffold du monorepo (Bun + Turborepo + `apps/server`, `apps/web`, `packages/shared-types`) — configs de base, rien de fonctionnel.
2. `packages/shared-types` : types `Card`, `Player`, `GameState`, `GameEvent` adaptés au jeu (voir §3), socket events.
3. Moteur pur (`apps/server/src/engine`) : boucle piocher→jouer→passer le tour, gestion N joueurs, élimination, quelques effets automatisés simples (skip tour, piocher X, poser carte devant soi).
4. Tests moteur (bun:test) + vérification déterminisme/replay sur ce sous-ensemble.
5. Couche service + WebSocket (rooms multi-joueurs, broadcast).
6. Premher jet d'UI (lobby N joueurs, plateau, main du joueur, cartes posées visibles).
7. Ajout progressif de cartes réelles (auto puis manuelles) au fil des sessions.
8. Cartes Étoile + logique de distribution équilibrée.
9. (Backlog) Extension Chaos, cartes vierges, replay UI.
