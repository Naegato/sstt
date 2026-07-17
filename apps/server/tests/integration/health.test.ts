import { describe, expect, it } from "bun:test";
import { buildApp } from "../../src/app.js";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });

    await app.close();
  });
});
