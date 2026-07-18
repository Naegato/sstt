import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signSessionToken, verifySessionToken } from "../auth/jwt.js";
import {
  buildAuthorizeUrl,
  fetchOAuthProfile,
  isProviderConfigured,
  type OAuthProviderName,
} from "../auth/oauth.js";
import { config } from "../config/env.js";
import { createUserWithPassword, findOrCreateOAuthUser, findUserByEmail, findUserById } from "../db/users-repository.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 jours, aligné sur l'expiration du JWT
};

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { email: string; password: string; displayName: string } }>("/register", async (request, reply) => {
    const { email, password, displayName } = request.body ?? {};
    if (!email || !password || !displayName) {
      return reply.code(400).send({ message: "email, password et displayName sont requis" });
    }
    if (password.length < 8) {
      return reply.code(400).send({ message: "Le mot de passe doit faire au moins 8 caractères" });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return reply.code(409).send({ message: "Un compte existe déjà avec cet email" });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUserWithPassword(email, passwordHash, displayName);
    const token = await signSessionToken(user.id);
    reply.setCookie(config.COOKIE_NAME, token, COOKIE_OPTIONS);
    return reply.code(201).send({ user });
  });

  fastify.post<{ Body: { email: string; password: string } }>("/login", async (request, reply) => {
    const { email, password } = request.body ?? {};
    if (!email || !password) {
      return reply.code(400).send({ message: "email et password sont requis" });
    }

    const user = await findUserByEmail(email);
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ message: "Identifiants invalides" });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ message: "Identifiants invalides" });
    }

    const token = await signSessionToken(user.id);
    reply.setCookie(config.COOKIE_NAME, token, COOKIE_OPTIONS);
    return reply.send({ user: { id: user.id, email: user.email, displayName: user.displayName } });
  });

  fastify.post("/logout", async (_request, reply) => {
    reply.clearCookie(config.COOKIE_NAME, { path: "/" });
    return reply.send({ ok: true });
  });

  fastify.get("/me", async (request, reply) => {
    const token = request.cookies[config.COOKIE_NAME];
    if (!token) return reply.code(401).send({ message: "Non authentifié" });

    const session = await verifySessionToken(token);
    if (!session) return reply.code(401).send({ message: "Session invalide" });

    const user = await findUserById(session.sub);
    if (!user) return reply.code(401).send({ message: "Compte introuvable" });

    return reply.send({ user });
  });

  for (const provider of ["discord", "google"] satisfies OAuthProviderName[]) {
    fastify.get(`/${provider}`, async (_request, reply) => {
      if (!isProviderConfigured(provider)) {
        return reply.code(501).send({ message: `OAuth ${provider} non configuré (variables d'env manquantes)` });
      }
      const state = crypto.randomUUID();
      return reply.redirect(buildAuthorizeUrl(provider, state));
    });

    fastify.get<{ Querystring: { code?: string; error?: string } }>(`/${provider}/callback`, async (request, reply) => {
      const { code, error } = request.query;
      if (error || !code) {
        return reply.redirect(`${config.WEB_ORIGIN}/login?error=oauth_${provider}`);
      }

      try {
        const profile = await fetchOAuthProfile(provider, code);
        const user = await findOrCreateOAuthUser({
          provider,
          providerAccountId: profile.providerAccountId,
          email: profile.email,
          displayName: profile.displayName,
        });
        const token = await signSessionToken(user.id);
        reply.setCookie(config.COOKIE_NAME, token, COOKIE_OPTIONS);
        return reply.redirect(config.WEB_ORIGIN);
      } catch (err) {
        request.log.error(err);
        return reply.redirect(`${config.WEB_ORIGIN}/login?error=oauth_${provider}`);
      }
    });
  }
}
