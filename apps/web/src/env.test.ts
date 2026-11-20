import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";
import { rawTestEnv } from "./test/env-fixture";

describe("parseEnv", () => {
  it("accepts a complete environment and trims the trailing slash from APP_URL", () => {
    const env = parseEnv({ ...rawTestEnv, APP_URL: "https://ahead.example.com/" });
    expect(env.APP_URL).toBe("https://ahead.example.com");
    expect(env.ALLOWED_EMAIL).toBe(rawTestEnv.ALLOWED_EMAIL);
  });

  it("names every missing variable", () => {
    expect(() => parseEnv({})).toThrow(
      /DATABASE_URL.*GOOGLE_CLIENT_ID.*GOOGLE_CLIENT_SECRET.*APP_URL.*ALLOWED_EMAIL.*TOKEN_ENCRYPTION_KEY.*SESSION_SECRET/,
    );
  });

  it.each([
    ["TOKEN_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"), /TOKEN_ENCRYPTION_KEY must be 32 bytes/],
    ["SESSION_SECRET", "too-short", /SESSION_SECRET must be at least 32 characters/],
    ["APP_URL", "not a url", /APP_URL/],
    ["APP_URL", "ftp://ahead.example.com", /APP_URL/],
    ["ALLOWED_EMAIL", "not-an-email", /ALLOWED_EMAIL/],
  ])("rejects a bad %s", (name, value, message) => {
    expect(() => parseEnv({ ...rawTestEnv, [name]: value })).toThrow(message);
  });

  it("never echoes secret values in the error", () => {
    const secret = "short-secret-value";
    expect(() => parseEnv({ ...rawTestEnv, SESSION_SECRET: secret })).not.toThrow(secret);
  });
});
