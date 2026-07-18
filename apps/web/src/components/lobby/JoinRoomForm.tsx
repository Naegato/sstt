"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayerId } from "@/hooks/usePlayerId";
import { useSocket } from "@/hooks/useSocket";
import { useGameStore } from "@/stores/gameStore";

export function JoinRoomForm() {
  const router = useRouter();
  const playerId = usePlayerId();
  const { joinRoom } = useSocket();
  const setIdentity = useGameStore((s) => s.setIdentity);

  const [roomId, setRoomId] = useState("");
  const [playerName, setPlayerName] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!playerId || !roomId.trim() || !playerName.trim()) return;

    setIdentity(roomId.trim(), playerId, playerName.trim());
    joinRoom(roomId.trim(), playerId, playerName.trim());
    router.push(`/game/${encodeURIComponent(roomId.trim())}`);
  };

  return (
    <form onSubmit={handleSubmit} className="join-room-form">
      <label>
        Nom de la room
        <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="ex: soiree-jeux" required />
      </label>
      <label>
        Ton nom
        <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="ex: Alice" required />
      </label>
      <button type="submit" disabled={!playerId}>
        Rejoindre
      </button>
    </form>
  );
}
