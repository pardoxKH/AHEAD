import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, loadEncryptionKey } from "./crypto.js";

const key = randomBytes(32);

describe("encryptSecret / decryptSecret", () => {
  it("round trips UTF-8 text in the v1 format", () => {
    const secret = "1//refresh-token é ✓";
    const ciphertext = encryptSecret(secret, key);
    expect(ciphertext).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(ciphertext).not.toContain("refresh");
    expect(decryptSecret(ciphertext, key)).toBe(secret);
  });

  it("detects tampering", () => {
    const [v, iv, tag, data] = encryptSecret("secret", key).split(":") as [string, string, string, string];
    const bytes = Buffer.from(data, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    expect(() => decryptSecret([v, iv, tag, bytes.toString("base64")].join(":"), key)).toThrow();
  });

  it("fails with the wrong key", () => {
    expect(() => decryptSecret(encryptSecret("secret", key), randomBytes(32))).toThrow();
  });

  it("uses a fresh IV each time", () => {
    const a = encryptSecret("same", key);
    const b = encryptSecret("same", key);
    expect(a.split(":")[1]).not.toBe(b.split(":")[1]);
    expect(a).not.toBe(b);
  });

  it("rejects unknown formats", () => {
    expect(() => decryptSecret("v2:a:b:c", key)).toThrow("format");
  });

  it("rejects a truncated auth tag", () => {
    const [v, iv, tag, data] = encryptSecret("secret", key).split(":") as [string, string, string, string];
    const shortTag = Buffer.from(tag, "base64").subarray(0, 4).toString("base64");
    expect(() => decryptSecret([v, iv, shortTag, data].join(":"), key)).toThrow("format");
  });

  it("rejects an IV that is not 12 bytes", () => {
    const [v, , tag, data] = encryptSecret("secret", key).split(":") as [string, string, string, string];
    const longIv = randomBytes(16).toString("base64");
    expect(() => decryptSecret([v, longIv, tag, data].join(":"), key)).toThrow("format");
  });
});

describe("loadEncryptionKey", () => {
  it("loads a 32-byte base64 key", () => {
    const env = { TOKEN_ENCRYPTION_KEY: key.toString("base64") };
    expect(loadEncryptionKey(env).equals(key)).toBe(true);
  });

  it("throws on a missing or wrong-length key", () => {
    expect(() => loadEncryptionKey({})).toThrow("not set");
    expect(() => loadEncryptionKey({ TOKEN_ENCRYPTION_KEY: randomBytes(16).toString("base64") })).toThrow(
      "32 bytes",
    );
  });
});
