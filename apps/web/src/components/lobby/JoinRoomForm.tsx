"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePlayerId } from "@/hooks/usePlayerId";
import { useSocket } from "@/hooks/useSocket";
import { useGameStore } from "@/stores/gameStore";
import { type JoinRoomInput, joinRoomSchema } from "@/lib/schemas";
import { getPersistedPlayerName, persistPlayerName } from "@/lib/playerIdentity";

type JoinRoomFormProps = {
  /** Nom du compte connecté (rendu côté serveur) — pré-remplissage par défaut si aucun nom de joueur n'a jamais été mémorisé sur ce navigateur. */
  initialName?: string | null;
};

export function JoinRoomForm({ initialName }: JoinRoomFormProps) {
  const router = useRouter();
  const playerId = usePlayerId();
  const { joinRoom } = useSocket();
  const setIdentity = useGameStore((s) => s.setIdentity);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<JoinRoomInput>({
    resolver: zodResolver(joinRoomSchema),
    // `initialName` vient du serveur (identique au premier rendu client) donc
    // safe en defaultValues, contrairement à `getPersistedPlayerName()`
    // (localStorage, jamais accessible côté serveur) qui doit attendre un
    // useEffect pour éviter un mismatch d'hydratation.
    defaultValues: { roomId: "", playerName: initialName ?? "" },
  });

  // Le dernier nom mémorisé sur ce navigateur (déjà utilisé pour jouer,
  // éventuellement en invité) prime sur le nom du compte connecté.
  useEffect(() => {
    const persisted = getPersistedPlayerName();
    if (persisted) setValue("playerName", persisted);
  }, [setValue]);

  const onSubmit = (data: JoinRoomInput) => {
    if (!playerId) return;
    persistPlayerName(data.playerName);
    setIdentity(data.roomId, playerId, data.playerName);
    joinRoom(data.roomId, playerId, data.playerName);
    router.push(`/game/${encodeURIComponent(data.roomId)}`);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="sticker-form">
      <label className="sticker-form__field">
        <span>Nom de la room</span>
        <input className="input-sticker" placeholder="ex: soiree-jeux" {...register("roomId")} />
        {errors.roomId && <span className="sticker-form__error">{errors.roomId.message}</span>}
      </label>
      <label className="sticker-form__field">
        <span>Ton nom</span>
        <input className="input-sticker" placeholder="ex: Alice" {...register("playerName")} />
        {errors.playerName && <span className="sticker-form__error">{errors.playerName.message}</span>}
      </label>
      <button type="submit" className="btn-sticker" disabled={!playerId || isSubmitting}>
        Rejoindre
      </button>
    </form>
  );
}
