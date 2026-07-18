"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "card-game:player-id";

/** Identité stable par navigateur, pour pouvoir se reconnecter à une room après un refresh. */
export function usePlayerId(): string | null {
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    setPlayerId(id);
  }, []);

  return playerId;
}
