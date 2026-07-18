import type { CardCatalogEntry } from "@card-game/shared-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.message ?? "Erreur inconnue", response.status);
  }
  return data;
}

export function registerAccount(
  email: string,
  password: string,
  displayName: string,
  firstName: string,
  lastName: string,
) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName, firstName, lastName }),
  });
}

export function login(email: string, password: string) {
  return apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export function logout() {
  return apiFetch("/api/auth/logout", { method: "POST" });
}

export async function getCardCatalog(): Promise<CardCatalogEntry[]> {
  const data = await apiFetch("/api/cards");
  return data.cards;
}
