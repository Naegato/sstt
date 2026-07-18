import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { config } from "./config/env.js";
import { registerSocket } from "./plugins/socket.js";
import authRoutes from "./routes/auth.js";
import cardsRoutes from "./routes/cards.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.ALLOWED_ORIGINS,
    credentials: true,
  });

  await app.register(cookie);

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(cardsRoutes, { prefix: "/api" });

  await registerSocket(app);

  app.get("/health", async () => ({ status: "ok", timestamp: Date.now() }));

  return app;
}
