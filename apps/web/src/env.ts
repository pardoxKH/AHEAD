import { z } from "zod";

const TOKEN_KEY_BYTES = 32;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "is required"),
  GOOGLE_CLIENT_ID: z.string().min(1, "is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "is required"),
  // Base URL of the app, without a trailing slash.
  APP_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, "")),
  ALLOWED_EMAIL: z.email(),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, "base64").length === TOKEN_KEY_BYTES, {
      message: `must be ${TOKEN_KEY_BYTES} bytes of base64`,
    }),
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Claude API key for the Google Doc import.
  ANTHROPIC_API_KEY: z.string().min(1, "is required"),
});

export type Env = z.infer<typeof envSchema>;

/** Validates raw environment variables. Errors name the variable but never echo its value. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`);
    throw new Error(`Invalid environment: ${problems.join("; ")}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** The validated environment, read once per process. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
