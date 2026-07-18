/**
 * Dernier nom utilisé pour rejoindre une partie, mémorisé par navigateur (même
 * principe que `usePlayerId` pour l'id) — permet de rouvrir un lien de partie
 * directement (`/game/[roomId]`, après un refresh ou depuis un lien partagé)
 * sans repasser par le formulaire du lobby, voir `apps/web/src/app/game/[roomId]/page.tsx`.
 */
const PLAYER_NAME_STORAGE_KEY = "card-game:player-name";

export function getPersistedPlayerName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
}

export function persistPlayerName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
}
