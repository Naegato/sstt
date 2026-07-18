"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePlayerId } from "@/hooks/usePlayerId";
import { useSocket } from "@/hooks/useSocket";
import { useGameStore } from "@/stores/gameStore";
import { type JoinRoomInput, joinRoomSchema } from "@/lib/schemas";

export function JoinRoomForm() {
  const router = useRouter();
  const playerId = usePlayerId();
  const { joinRoom } = useSocket();
  const setIdentity = useGameStore((s) => s.setIdentity);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JoinRoomInput>({
    resolver: zodResolver(joinRoomSchema),
    defaultValues: { roomId: "", playerName: "" },
  });

  const onSubmit = (data: JoinRoomInput) => {
    if (!playerId) return;
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
