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
 * cascades from it. Returns whether Google confirmed the revocation.
 */
export async function deleteAccount(userId: string, deps: DeleteDeps): Promise<{ revoked: boolean }> {
  const [token] = await deps.db
    .select({ encrypted: oauthTokens.encryptedRefreshToken })
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId));

  let revoked = false;
  if (token) {
    try {
      await deps.revokeToken(decryptSecret(token.encrypted, deps.encryptionKey));
      revoked = true;
    } catch (err) {
      // Log only the error type: messages from Google's client can echo request details.
      console.error("Google token revocation failed:", (err as Error).name);
    }
  }

  await deps.db.delete(users).where(eq(users.id, userId));
  return { revoked };
}
