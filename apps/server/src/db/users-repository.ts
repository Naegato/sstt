import { and, eq } from "drizzle-orm";
import type { PublicUser, UserId } from "@card-game/shared-types";
import { db } from "./client.js";
import { oauthAccounts, users } from "./schema.js";

function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function findUserById(id: UserId): Promise<PublicUser | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ? toPublicUser(user) : null;
}

export async function createUserWithPassword(
  email: string,
  passwordHash: string,
  displayName: string,
): Promise<PublicUser> {
  const [user] = await db.insert(users).values({ email, passwordHash, displayName }).returning();
  if (!user) throw new Error("Échec de la création du compte");
  return toPublicUser(user);
}

export async function findUserByOAuthAccount(provider: string, providerAccountId: string): Promise<PublicUser | null> {
  const [row] = await db
    .select({ user: users })
    .from(oauthAccounts)
    .innerJoin(users, eq(users.id, oauthAccounts.userId))
    .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, providerAccountId)))
    .limit(1);
  return row ? toPublicUser(row.user) : null;
}

/** Crée un compte OAuth-only (pas de mot de passe local) ou lie le provider à un compte existant par email. */
export async function findOrCreateOAuthUser(params: {
  provider: string;
  providerAccountId: string;
  email: string;
  displayName: string;
}): Promise<PublicUser> {
  const existingByOAuth = await findUserByOAuthAccount(params.provider, params.providerAccountId);
  if (existingByOAuth) return existingByOAuth;

  const existingByEmail = await findUserByEmail(params.email);
  const user = existingByEmail
    ? toPublicUser(existingByEmail)
    : await (async () => {
        const [created] = await db
          .insert(users)
          .values({ email: params.email, displayName: params.displayName, passwordHash: null })
          .returning();
        if (!created) throw new Error("Échec de la création du compte");
        return toPublicUser(created);
      })();

  await db.insert(oauthAccounts).values({
    userId: user.id,
    provider: params.provider,
    providerAccountId: params.providerAccountId,
  });

  return user;
}
