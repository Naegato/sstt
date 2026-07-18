export const config = {
  PORT: Number(process.env.PORT ?? 3001),
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:3000"],

  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://card_game:card_game@localhost:5432/card_game",
  JWT_SECRET: process.env.JWT_SECRET ?? "dev-secret-change-me",
  COOKIE_NAME: "card_game_session",
  /** En dev sur http://localhost, un cookie "secure" ne serait jamais envoyé. */
  COOKIE_SECURE: process.env.NODE_ENV === "production",

  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:3000",

  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI: process.env.DISCORD_REDIRECT_URI ?? "http://localhost:3001/api/auth/discord/callback",

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/api/auth/google/callback",
};
