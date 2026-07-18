import "server-only";

import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import type { PublicUser } from "@card-game/shared-types";

const COOKIE_NAME = "card_game_session";
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type Session = { userId: string };

/**
 * Vérifie le JWT directement ici (secret partagé avec apps/server), sans repasser
 * par le réseau — cohérent avec "JWT en cookie httpOnly lu via Server Components".
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

/** Profil complet (email, displayName) — va chercher la donnée fraîche côté backend. */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const response = await fetch(`${API_URL}/api/auth/me`, {
    headers: { cookie: `${COOKIE_NAME}=${token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { user: PublicUser };
  return data.user;
}
