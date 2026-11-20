import { createHmac, timingSafeEqual } from "node:crypto";

// Stateless session: `<userId>.<expiresAtMs>.<hmac>`, HMAC-SHA256 over `<userId>.<expiresAtMs>`.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Session {
  userId: string;
  expiresAt: Date;
}

const mac = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export function signSession(userId: string, secret: string, now: Date): string {
  if (userId.includes(".")) throw new Error("userId must not contain '.'");
  const payload = `${userId}.${now.getTime() + SESSION_TTL_MS}`;
  return `${payload}.${mac(payload, secret)}`;
}

/** Returns the session if the token is intact and unexpired, otherwise null. */
export function verifySession(token: string | undefined, secret: string, now: Date): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtRaw, signature] = parts as [string, string, string];

  const expected = Buffer.from(mac(`${userId}.${expiresAtRaw}`, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const expiresAtMs = Number(expiresAtRaw);
  if (!userId || !Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now.getTime()) return null;
  return { userId, expiresAt: new Date(expiresAtMs) };
}
