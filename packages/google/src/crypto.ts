import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for secrets at rest (refresh tokens). Format: v1:<iv>:<tag>:<data>, each base64.
const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

/** Reads the 32-byte key from `TOKEN_ENCRYPTION_KEY` (base64). */
export function loadEncryptionKey(
  env: Record<string, string | undefined>,
  name = "TOKEN_ENCRYPTION_KEY",
): Buffer {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`${name} must be ${KEY_BYTES} bytes of base64, got ${key.length} bytes`);
  }
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(ciphertext: string, key: Buffer): string {
  const [version, iv, tag, data, ...rest] = ciphertext.split(":");
  if (version !== VERSION || iv === undefined || tag === undefined || data === undefined || rest.length) {
    throw new Error("Unrecognized ciphertext format");
  }
  const ivBytes = Buffer.from(iv, "base64");
  const tagBytes = Buffer.from(tag, "base64");
  // Reject truncated tags: GCM would otherwise accept a shorter, forgeable tag.
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) {
    throw new Error("Unrecognized ciphertext format");
  }
  const decipher = createDecipheriv(ALGORITHM, key, ivBytes, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
