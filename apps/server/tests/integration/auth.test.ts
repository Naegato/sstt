import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/client.js";
import { users } from "../../src/db/schema.js";

/**
 * Tests contre une vraie base Postgres (docker-compose) — pas de mock, cohérent
 * avec le reste du projet. Nécessite `docker compose up -d` avant `bun test`.
 */
describe("Routes /api/auth", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const email = `test-${Date.now()}@example.com`;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, email));
    await app.close();
  });

  it("refuse l'inscription avec un mot de passe trop court", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "short", displayName: "Test" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("inscrit un nouvel utilisateur et pose un cookie de session httpOnly", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "supersecret123", displayName: "Test" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user.email).toBe(email);
    expect(body.user.displayName).toBe("Test");
    expect(body.user.passwordHash).toBeUndefined();

    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain("HttpOnly");
  });

  it("refuse une seconde inscription avec le même email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "supersecret123", displayName: "Test 2" },
    });
    expect(response.statusCode).toBe(409);
  });

  it("connecte avec les bons identifiants et refuse les mauvais", async () => {
    const badLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "wrong-password" },
    });
    expect(badLogin.statusCode).toBe(401);

    const goodLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "supersecret123" },
    });
    expect(goodLogin.statusCode).toBe(200);
    expect(goodLogin.json().user.email).toBe(email);
  });

  it("le flux complet cookie → /me → logout → /me fonctionne", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password: "supersecret123" },
    });
    const cookieHeader = login.headers["set-cookie"];
    const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: cookie ?? "" } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);

    const meWithoutCookie = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(meWithoutCookie.statusCode).toBe(401);

    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: cookie ?? "" } });
    expect(logout.statusCode).toBe(200);
  });

  it("répond 501 sur les providers OAuth non configurés (pas de credentials en env de test)", async () => {
    const response = await app.inject({ method: "GET", url: "/api/auth/discord" });
    expect(response.statusCode).toBe(501);
  });
});
