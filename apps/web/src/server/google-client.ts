import { createOAuthClient } from "@ahead/google";
import type { Env } from "../env";

export const redirectUri = (env: Pick<Env, "APP_URL">) => `${env.APP_URL}/api/auth/google/callback`;

export function googleClient(env: Env) {
  return createOAuthClient({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri(env),
  });
}
