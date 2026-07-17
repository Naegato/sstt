import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config/env.js";
import { registerSocket } from "./plugins/socket.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.ALLOWED_ORIGINS,
    credentials: true,
  });

  await registerSocket(app);

  app.get("/health", async () => ({ status: "ok", timestamp: Date.now() }));

  return app;
}
