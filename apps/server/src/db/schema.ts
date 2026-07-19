import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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

/**
 * Event log persistant (voir GameService.eventLog, jusqu'ici uniquement en
 * mémoire — perdu à chaque redémarrage du serveur, ce qui a empêché de
 * déboguer une vraie partie signalée en prod). `apiVersion` (le SHA du commit
 * déployé, voir `config.API_VERSION`) est stocké sur chaque event pour ne
 * jamais confondre le comportement observé avec une version différente du
 * moteur — demande explicite de l'utilisateur ("pour pas se tromper").
 * Écriture "fire-and-forget" côté GameService (voir game-service.ts) : ne
 * bloque jamais une action de jeu si la DB est indisponible, ce n'est qu'un
 * journal d'audit, pas une dépendance de la boucle de jeu elle-même.
 */
export const gameEvents = pgTable(
  "game_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: text("room_id").notNull(),
    /** Ordre au sein de la room (0, 1, 2...) — plus fiable qu'un tri par timestamp si deux events partagent la même milliseconde. */
    sequence: integer("sequence").notNull(),
    event: jsonb("event").notNull(),
    apiVersion: text("api_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("game_events_room_sequence_idx").on(table.roomId, table.sequence),
    index("game_events_room_id_idx").on(table.roomId),
  ],
);
