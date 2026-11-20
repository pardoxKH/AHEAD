import { OAuth2Client } from "google-auth-library";
import type { Credentials } from "google-auth-library";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function createOAuthClient({ clientId, clientSecret, redirectUri }: OAuthConfig): OAuth2Client {
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

export interface AuthUrlOptions {
  scopes: readonly string[];
  /** Opaque CSRF value, checked again on the callback. */
  state: string;
  /** Keep scopes granted earlier when asking for more (incremental authorization). */
  includeGrantedScopes: boolean;
}

export function buildAuthUrl(client: OAuth2Client, { scopes, state, includeGrantedScopes }: AuthUrlOptions) {
  return client.generateAuthUrl({
    access_type: "offline",
    // Always show consent so Google returns a refresh token.
    prompt: "consent",
    scope: [...scopes],
    state,
    include_granted_scopes: includeGrantedScopes,
  });
}

export interface ExchangedTokens {
  tokens: Credentials;
  grantedScopes: string[];
}

/** Trades an authorization code for tokens and sets them on the client. */
export async function exchangeCode(client: OAuth2Client, code: string): Promise<ExchangedTokens> {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const grantedScopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
  return { tokens, grantedScopes };
}

export class NotAllowedUserError extends Error {
  constructor(reason: string) {
    super(`Google account not allowed: ${reason}`);
    this.name = "NotAllowedUserError";
  }
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export interface VerifyUserOptions {
  idToken: string;
  /** The OAuth client id the token must be issued for. */
  audience: string;
  allowedEmail: string;
}

/**
 * Verifies the ID token's signature and audience, then accepts only the one allowed account,
 * and only if Google has verified its email. Returns the normalized email.
 */
export async function verifyAllowedUser(
  verifier: Pick<OAuth2Client, "verifyIdToken">,
  { idToken, audience, allowedEmail }: VerifyUserOptions,
): Promise<string> {
  const ticket = await verifier.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload?.email) throw new NotAllowedUserError("token has no email");
  if (payload.email_verified !== true) throw new NotAllowedUserError("email is not verified");
  const email = normalizeEmail(payload.email);
  if (email !== normalizeEmail(allowedEmail)) throw new NotAllowedUserError(email);
  return email;
}
