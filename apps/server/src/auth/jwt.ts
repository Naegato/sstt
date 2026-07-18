import { jwtVerify, SignJWT } from "jose";
import type { UserId } from "@card-game/shared-types";
import { config } from "../config/env.js";

const secret = new TextEncoder().encode(config.JWT_SECRET);
const ALG = "HS256";

export type SessionPayload = {
  sub: UserId;
};

export async function signSessionToken(userId: UserId): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    if (!payload.sub) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
