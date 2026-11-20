import type { Env } from "../env";

// Obviously fake values for tests only.
export const rawTestEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/ahead_test",
  GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  APP_URL: "http://localhost:3000",
  ALLOWED_EMAIL: "owner@example.com",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  SESSION_SECRET: "s".repeat(32),
  ANTHROPIC_API_KEY: "test-anthropic-key",
} satisfies Record<keyof Env, string>;

export const testEnv: Env = { ...rawTestEnv };
