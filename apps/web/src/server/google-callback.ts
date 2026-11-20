import { encryptSecret, exchangeCode, loadEncryptionKey, verifyAllowedUser } from "@ahead/google";
import type { Env } from "../env";
import type { GoogleConnection } from "./connection-store";
import { googleClient } from "./google-client";
import { checkState } from "./oauth-state";

export interface CallbackInput {
  code: string | null;
  returnedState: string | null;
  cookieState: string | undefined;
  /** Set when the user cancels or Google refuses (for example `access_denied`). */
  error: string | null;
}

export type CallbackResult =
  { ok: true; userId: string } | { ok: false; reason: "state" | "denied" | "failed" | "not_allowed" };

export interface CallbackDeps {
  env: Env;
  saveConnection: (conn: GoogleConnection) => Promise<{ userId: string }>;
}

/**
 * Finishes Google sign-in: checks state, exchanges the code, accepts only the allowed account,
 * then stores the encrypted refresh token. Token values never leave this function except encrypted.
 */
export async function completeGoogleSignIn(
  input: CallbackInput,
  deps: CallbackDeps,
): Promise<CallbackResult> {
  if (!checkState(input.cookieState, input.returnedState)) return { ok: false, reason: "state" };
  if (input.error) return { ok: false, reason: "denied" };
  if (!input.code) return { ok: false, reason: "failed" };

  const { env } = deps;
  const client = googleClient(env);
  const { tokens, grantedScopes } = await exchangeCode(client, input.code);
  if (!tokens.id_token) return { ok: false, reason: "failed" };

  let email: string;
  try {
    email = await verifyAllowedUser(client, {
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
      allowedEmail: env.ALLOWED_EMAIL,
    });
  } catch {
    return { ok: false, reason: "not_allowed" };
  }

  const key = loadEncryptionKey({ TOKEN_ENCRYPTION_KEY: env.TOKEN_ENCRYPTION_KEY });
  const { userId } = await deps.saveConnection({
    email,
    encryptedRefreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token, key) : undefined,
    scopes: grantedScopes,
  });
  return { ok: true, userId };
}
