import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  /** Null si le compte n'a été créé que via OAuth (pas de mot de passe local). */
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull(),
  /**
   * Requis à l'inscription email/mot de passe. Pour les comptes OAuth : dérivés
   * automatiquement de Google (given_name/family_name) quand disponibles, sinon
   * `null` (Discord ne fournit pas de prénom/nom séparés) — pas de page profil
   * pour les renseigner après coup pour l'instant.
   */
  firstName: text("first_name"),
  lastName: text("last_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "discord" | "google"
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("oauth_provider_account_idx").on(table.provider, table.providerAccountId)],
);
