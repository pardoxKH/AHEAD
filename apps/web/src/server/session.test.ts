import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS, signSession, verifySession } from "./session";

const secret = "x".repeat(32);
const userId = "6f1c2c8e-5b8a-4f3e-9a51-2a9d3c1e7b10";
const now = new Date("2026-11-20T08:00:00Z");

describe("session", () => {
  it("round-trips a signed session", () => {
    const token = signSession(userId, secret, now);
    expect(verifySession(token, secret, now)).toEqual({
      userId,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    });
  });

  it("lasts 30 days", () => {
    const token = signSession(userId, secret, now);
    const almost = new Date(now.getTime() + SESSION_TTL_MS - 1);
    const expired = new Date(now.getTime() + SESSION_TTL_MS);
    expect(verifySession(token, secret, almost)).not.toBeNull();
    expect(verifySession(token, secret, expired)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const token = signSession(userId, "y".repeat(32), now);
    expect(verifySession(token, secret, now)).toBeNull();
  });

  it("rejects a tampered user id or expiry", () => {
    const [, expiresAt, signature] = signSession(userId, secret, now).split(".");
    const otherUser = `00000000-0000-4000-8000-000000000000.${expiresAt}.${signature}`;
    const longer = `${userId}.${Number(expiresAt) + SESSION_TTL_MS}.${signature}`;
    expect(verifySession(otherUser, secret, now)).toBeNull();
    expect(verifySession(longer, secret, now)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signSession(userId, secret, now);
    const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifySession(flipped, secret, now)).toBeNull();
    expect(verifySession(token.slice(0, -2), secret, now)).toBeNull();
  });

  it.each([undefined, "", "garbage", "a.b", "a.b.c.d"])("rejects a malformed token %j", (token) => {
    expect(verifySession(token, secret, now)).toBeNull();
  });
});
