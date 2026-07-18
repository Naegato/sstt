"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { GameBoard } from "@/components/game/GameBoard";
import { usePlayerId } from "@/hooks/usePlayerId";
import { useSocket } from "@/hooks/useSocket";
import { useGameStore } from "@/stores/gameStore";
import { getPersistedPlayerName, persistPlayerName } from "@/lib/playerIdentity";

/**
 * Arriver directement sur cette page (refresh, lien de partie partagé, nouvel
 * onglet) ne passe jamais par `JoinRoomForm` — sans ça, `GameBoard` restait
 * bloqué indéfiniment sur "Connexion à la partie..." car `roomId`/`playerName`
 * ne sont jamais renseignés dans le store. On reconstitue l'identité ici à
 * partir de l'URL (roomId) + du nom mémorisé par navigateur (voir
 * `playerIdentity.ts`) ; si aucun nom n'est mémorisé (tout premier lien ouvert
 * sans être passé par le lobby), on le demande via un petit formulaire local.
 */
export default function GamePage() {
  const params = useParams<{ roomId: string }>();
  const roomId = decodeURIComponent(params.roomId);
  const playerId = usePlayerId();
  const { joinRoom } = useSocket();
  const storeRoomId = useGameStore((s) => s.roomId);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const [nameInput, setNameInput] = useState("");
  // `undefined` = pas encore résolu (évite un mismatch d'hydratation : le
  // serveur n'a pas accès à localStorage, donc le premier rendu client doit
  // rester identique au rendu serveur avant de lire la valeur persistée,
  // même principe que le `useEffect` + `setValue` de `JoinRoomForm.tsx`).
  const [persistedName, setPersistedName] = useState<string | null | undefined>(undefined);

  const alreadyIdentified = storeRoomId === roomId;

  useEffect(() => {
    setPersistedName(getPersistedPlayerName());
  }, []);

  useEffect(() => {
    if (!playerId || alreadyIdentified || !persistedName) return;
    setIdentity(roomId, playerId, persistedName);
    joinRoom(roomId, playerId, persistedName);
  }, [playerId, roomId, alreadyIdentified, persistedName, setIdentity, joinRoom]);

  if (!alreadyIdentified && persistedName === undefined) {
    return (
      <main className="centered-page">
        <p>Connexion à la partie...</p>
      </main>
    );
  }

  if (!alreadyIdentified && !persistedName) {
    return (
      <main className="centered-page">
        <div className="sticker-page-card">
          <h1>Rejoindre {roomId}</h1>
          <form
            className="sticker-form"
            onSubmit={(e) => {
              e.preventDefault();
              const name = nameInput.trim();
              if (!playerId || !name) return;
              persistPlayerName(name);
              setIdentity(roomId, playerId, name);
              joinRoom(roomId, playerId, name);
            }}
          >
            <label className="sticker-form__field">
              <span>Ton nom</span>
              <input
                className="input-sticker"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="ex: Alice"
              />
            </label>
            <button type="submit" className="btn-sticker" disabled={!playerId || !nameInput.trim()}>
              Rejoindre
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main>
      <GameBoard />
    </main>
  );
}
