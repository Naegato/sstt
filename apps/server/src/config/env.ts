export const config = {
  PORT: Number(process.env.PORT ?? 3001),
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:3000"],
};
