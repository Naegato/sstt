"use client";

import { useEffect, useRef, useState } from "react";
import {
  CARD_ANNOUNCEMENT_MS,
  CHOICE_REVEAL_MS,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type GameState,
  type VoteChoice,
} from "@card-game/shared-types";
import { getSocket } from "@/lib/socket";
import { useGameStore } from "@/stores/gameStore";
import { extractPlayAnnouncements, type AnySideEffect, type PlayAnnouncement } from "@/lib/playAnnouncements";
import { extractChoiceReveal, type ChoiceReveal } from "@/lib/choiceReveal";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useSocket() {
  const socketRef = useRef(getSocket());
  const updateGameState = useGameStore((s) => s.updateGameState);
  const setError = useGameStore((s) => s.setError);
  // Carte(s) en cours d'annonce (voir extractPlayAnnouncements) : le nouvel
  // état reçu n'est appliqué au store qu'APRÈS les avoir montrées une à une,
  // pour laisser le temps de comprendre ce qui vient d'être joué avant que
  // l'effet (points, élimination, victoire...) ne devienne visible — demande
  // explicite de l'utilisateur ("le jeu va trop vite"). Les mises à jour
  // s'enchaînent via une queue de promesses pour ne jamais en sauter une.
  const [announcement, setAnnouncement] = useState<PlayAnnouncement | null>(null);
  // "Qui a voté/choisi quoi" (Bataille, Chiffre, Cadeaux...) : révélé une fois
  // la résolution actée côté moteur, jamais pendant que le vote est encore en
  // cours — demande explicite de l'utilisateur. Même file d'attente que les
  // annonces de cartes, pour ne jamais chevaucher deux révélations.
  const [choiceReveal, setChoiceReveal] = useState<ChoiceReveal | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const socket = socketRef.current;
    socket.connect();

    const onStateUpdate = (payload: { state: GameState; sideEffects?: AnySideEffect[] }) => {
      const announcements = extractPlayAnnouncements(payload.state, payload.sideEffects);
      const reveal = extractChoiceReveal(payload.state, payload.sideEffects);
      queueRef.current = queueRef.current.then(async () => {
        for (const next of announcements) {
          setAnnouncement(next);
          await sleep(CARD_ANNOUNCEMENT_MS);
        }
        setAnnouncement(null);
        if (reveal) {
          setChoiceReveal(reveal);
          await sleep(CHOICE_REVEAL_MS);
          setChoiceReveal(null);
        }
        updateGameState(payload.state);
      });
    };
    const onError = (payload: { message: string }) => setError(payload.message);
    // Socket.IO reconnecte automatiquement la connexion sous-jacente après une
    // coupure (réseau, redémarrage du serveur...), mais "rejoindre" une room
    // socket.io (socket.join côté serveur) ne survit PAS à un nouveau socket.id
    // — sans ça, le client reste connecté mais ne reçoit plus jamais aucune
    // mise à jour, silencieusement. On réémet donc JOIN_ROOM à chaque (re)connexion.
    const onConnect = () => {
      const { roomId, playerId, playerName } = useGameStore.getState();
      if (roomId && playerId && playerName) {
        socket.emit(CLIENT_EVENTS.JOIN_ROOM, { roomId, playerId, playerName });
      }
    };

    socket.on(SERVER_EVENTS.GAME_STATE_UPDATE, onStateUpdate);
    socket.on(SERVER_EVENTS.ERROR, onError);
    socket.on("connect", onConnect);

    return () => {
      socket.off(SERVER_EVENTS.GAME_STATE_UPDATE, onStateUpdate);
      socket.off(SERVER_EVENTS.ERROR, onError);
      socket.off("connect", onConnect);
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
    claimWin?: boolean,
    givenCardIds?: string[],
  ) => {
    socketRef.current.emit(CLIENT_EVENTS.PLAY_CARD, {
      roomId,
      playerId,
      cardId,
      targetPlayerId,
      playedAsInterrupt,
      claimWin,
      givenCardIds,
    });
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

  const resetGame = (roomId: string) => {
    socketRef.current.emit(CLIENT_EVENTS.RESET_GAME, { roomId });
  };

  const submitChoice = (roomId: string, playerId: string, value: string) => {
    socketRef.current.emit(CLIENT_EVENTS.SUBMIT_CHOICE, { roomId, playerId, value });
  };

  const toggleNoseTouch = (roomId: string, playerId: string, touching: boolean) => {
    socketRef.current.emit(CLIENT_EVENTS.TOGGLE_NOSE_TOUCH, { roomId, playerId, touching });
  };

  const slapHand = (roomId: string, playerId: string) => {
    socketRef.current.emit(CLIENT_EVENTS.SLAP_HAND, { roomId, playerId });
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
    resetGame,
    submitChoice,
    toggleNoseTouch,
    slapHand,
    announcement,
    choiceReveal,
  };
}
