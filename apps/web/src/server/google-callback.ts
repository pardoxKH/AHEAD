import type { Credentials, OAuth2Client } from "google-auth-library";
import {
  encryptSecret,
  exchangeCode,
  loadEncryptionKey,
  NotAllowedUserError,
  verifyAllowedUser,
} from "@ahead/google";
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
  if (!tokens.id_token) {
    await discardTokens(client, tokens);
    return { ok: false, reason: "failed" };
  }

  let email: string;
  try {
    email = await verifyAllowedUser(client, {
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
      allowedEmail: env.ALLOWED_EMAIL,
    });
  } catch (err) {
    // Only a NotAllowedUserError means "wrong account"; anything else (bad signature, network) is a failure.
    await discardTokens(client, tokens);
    return { ok: false, reason: err instanceof NotAllowedUserError ? "not_allowed" : "failed" };
  }

  const key = loadEncryptionKey({ TOKEN_ENCRYPTION_KEY: env.TOKEN_ENCRYPTION_KEY });
  const { userId } = await deps.saveConnection({
    email,
    encryptedRefreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token, key) : undefined,
    scopes: grantedScopes,
  });
  return { ok: true, userId };
}

/** Best effort: revoke tokens we will not keep, so a refused grant is not left live at Google. */
async function discardTokens(client: Pick<OAuth2Client, "revokeToken">, tokens: Credentials) {
  // Revoking the refresh token also revokes access tokens issued from it.
  const token = tokens.refresh_token ?? tokens.access_token;
  if (!token) return;
  try {
    await client.revokeToken(token);
  } catch (err) {
    console.error("Revoking an unused Google token failed:", (err as Error).name);
  }
}
