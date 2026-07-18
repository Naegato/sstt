"use client";

import { useEffect, useRef } from "react";
import { CLIENT_EVENTS, SERVER_EVENTS, type GameState, type VoteChoice } from "@card-game/shared-types";
import { getSocket } from "@/lib/socket";
import { useGameStore } from "@/stores/gameStore";

export function useSocket() {
  const socketRef = useRef(getSocket());
  const updateGameState = useGameStore((s) => s.updateGameState);
  const setError = useGameStore((s) => s.setError);

  useEffect(() => {
    const socket = socketRef.current;
    socket.connect();

    const onStateUpdate = (payload: { state: GameState }) => updateGameState(payload.state);
    const onError = (payload: { message: string }) => setError(payload.message);

    socket.on(SERVER_EVENTS.GAME_STATE_UPDATE, onStateUpdate);
    socket.on(SERVER_EVENTS.ERROR, onError);

    return () => {
      socket.off(SERVER_EVENTS.GAME_STATE_UPDATE, onStateUpdate);
      socket.off(SERVER_EVENTS.ERROR, onError);
    };
  }, [updateGameState, setError]);

  const joinRoom = (roomId: string, playerId: string, playerName: string) => {
    socketRef.current.emit(CLIENT_EVENTS.JOIN_ROOM, { roomId, playerId, playerName });
  };

  const startGame = (roomId: string) => {
    socketRef.current.emit(CLIENT_EVENTS.START_GAME, { roomId });
  };

  const playCard = (
    roomId: string,
    playerId: string,
    cardId: string,
    targetPlayerId?: string,
    playedAsInterrupt?: boolean,
  ) => {
    socketRef.current.emit(CLIENT_EVENTS.PLAY_CARD, { roomId, playerId, cardId, targetPlayerId, playedAsInterrupt });
  };

  const endTurn = (roomId: string, playerId: string) => {
    socketRef.current.emit(CLIENT_EVENTS.END_TURN, { roomId, playerId });
  };

  const castVote = (roomId: string, playerId: string, choice: VoteChoice) => {
    socketRef.current.emit(CLIENT_EVENTS.CAST_VOTE, { roomId, playerId, choice });
  };

  const stealPlayedCard = (roomId: string, playerId: string, targetPlayerId: string, cardId: string) => {
    socketRef.current.emit(CLIENT_EVENTS.STEAL_PLAYED_CARD, { roomId, playerId, targetPlayerId, cardId });
  };

  const passHotPotato = (roomId: string, playerId: string) => {
    socketRef.current.emit(CLIENT_EVENTS.PASS_HOT_POTATO, { roomId, playerId });
  };

  const denouncePlayer = (roomId: string, challengerId: string, targetPlayerId: string, reason: string) => {
    socketRef.current.emit(CLIENT_EVENTS.CHALLENGE_ELIMINATION, { roomId, challengerId, targetPlayerId, reason });
  };

  const confirmManualAction = (roomId: string, playerId: string, cardId: string) => {
    socketRef.current.emit(CLIENT_EVENTS.CONFIRM_MANUAL_ACTION, { roomId, playerId, cardId });
  };

  return {
    joinRoom,
    startGame,
    playCard,
    endTurn,
    castVote,
    stealPlayedCard,
    passHotPotato,
    denouncePlayer,
    confirmManualAction,
  };
}
