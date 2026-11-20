import { eq } from "drizzle-orm";
import { oauthTokens, users, type Db } from "@ahead/db";
import { decryptSecret } from "@ahead/google";

export const DELETE_CONFIRMATION = "DELETE";

export interface DeleteDeps {
  db: Db;
  encryptionKey: Buffer;
  revokeToken: (token: string) => Promise<unknown>;
}

/**
 * Revokes the stored Google token (best effort) and deletes the user row; every other table
 * cascades from it. `none` means there was no stored token, so nothing to revoke.
 */
export type Revocation = "revoked" | "failed" | "none";

export async function deleteAccount(userId: string, deps: DeleteDeps): Promise<{ revocation: Revocation }> {
  const [token] = await deps.db
    .select({ encrypted: oauthTokens.encryptedRefreshToken })
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId));

  let revocation: Revocation = "none";
  if (token) {
    try {
      await deps.revokeToken(decryptSecret(token.encrypted, deps.encryptionKey));
      revocation = "revoked";
    } catch (err) {
      // Log only the error type: messages from Google's client can echo request details.
      console.error("Google token revocation failed:", (err as Error).name);
      revocation = "failed";
    }
  }

  await deps.db.delete(users).where(eq(users.id, userId));
  return { revocation };
}
