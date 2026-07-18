import { config } from "../config/env.js";

export type OAuthProfile = {
  providerAccountId: string;
  email: string;
  displayName: string;
  /** Fournis par Google (given_name/family_name) ; jamais par Discord, qui n'a pas d'équivalent. */
  firstName?: string;
  lastName?: string;
};

type ProviderConfig = {
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
};

const DISCORD: ProviderConfig = {
  clientId: config.DISCORD_CLIENT_ID,
  clientSecret: config.DISCORD_CLIENT_SECRET,
  redirectUri: config.DISCORD_REDIRECT_URI,
  authorizeUrl: "https://discord.com/api/oauth2/authorize",
  tokenUrl: "https://discord.com/api/oauth2/token",
  scope: "identify email",
};

const GOOGLE: ProviderConfig = {
  clientId: config.GOOGLE_CLIENT_ID,
  clientSecret: config.GOOGLE_CLIENT_SECRET,
  redirectUri: config.GOOGLE_REDIRECT_URI,
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scope: "openid email profile",
};

export const OAUTH_PROVIDERS = { discord: DISCORD, google: GOOGLE } as const;
export type OAuthProviderName = keyof typeof OAUTH_PROVIDERS;

export function isProviderConfigured(name: OAuthProviderName): boolean {
  const provider = OAUTH_PROVIDERS[name];
  return Boolean(provider.clientId && provider.clientSecret);
}

export function buildAuthorizeUrl(name: OAuthProviderName, state: string): string {
  const provider = OAUTH_PROVIDERS[name];
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", provider.clientId ?? "");
  url.searchParams.set("redirect_uri", provider.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scope);
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCodeForToken(name: OAuthProviderName, code: string): Promise<string> {
  const provider = OAUTH_PROVIDERS[name];
  const body = new URLSearchParams({
    client_id: provider.clientId ?? "",
    client_secret: provider.clientSecret ?? "",
    grant_type: "authorization_code",
    code,
    redirect_uri: provider.redirectUri,
  });

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Échange du code OAuth (${name}) échoué : ${response.status}`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

async function fetchDiscordProfile(accessToken: string): Promise<OAuthProfile> {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Récupération du profil Discord échouée : ${response.status}`);
  const data = (await response.json()) as { id: string; email: string; username: string };
  return { providerAccountId: data.id, email: data.email, displayName: data.username };
}

async function fetchGoogleProfile(accessToken: string): Promise<OAuthProfile> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Récupération du profil Google échouée : ${response.status}`);
  const data = (await response.json()) as {
    id: string;
    email: string;
    name: string;
    given_name?: string;
    family_name?: string;
  };
  return {
    providerAccountId: data.id,
    email: data.email,
    displayName: data.name,
    firstName: data.given_name,
    lastName: data.family_name,
  };
}

export async function fetchOAuthProfile(name: OAuthProviderName, code: string): Promise<OAuthProfile> {
  const accessToken = await exchangeCodeForToken(name, code);
  return name === "discord" ? fetchDiscordProfile(accessToken) : fetchGoogleProfile(accessToken);
}
