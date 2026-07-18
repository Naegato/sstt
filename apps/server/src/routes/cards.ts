import type { FastifyInstance } from "fastify";
import { loadCardCatalogSummary } from "../content/cards-catalog.js";

export default async function cardsRoutes(fastify: FastifyInstance) {
  fastify.get("/cards", async () => {
    const cards = await loadCardCatalogSummary();
    return { cards };
  });
}
