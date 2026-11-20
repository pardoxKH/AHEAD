import { eq } from "drizzle-orm";
import { auditLog, oauthTokens, users, type Db } from "@ahead/db";

export interface GoogleConnection {
  email: string;
  /** Already encrypted. Undefined when Google sent no new refresh token (re-consent). */
  encryptedRefreshToken: string | undefined;
  scopes: string[];
}

export class MissingRefreshTokenError extends Error {
  constructor() {
    super("Google returned no refresh token and none is stored");
    this.name = "MissingRefreshTokenError";
  }
}

/**
 * Upserts the user by email and their Google token row, and records the connection in the audit
 * log, in one transaction. Without a new refresh token, the stored one is kept.
 */
export async function saveGoogleConnection(db: Db, conn: GoogleConnection): Promise<{ userId: string }> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: conn.email })
      .onConflictDoUpdate({ target: users.email, set: { updatedAt: new Date() } })
      .returning({ id: users.id });
    if (!user) throw new Error("user upsert returned no row");

    if (conn.encryptedRefreshToken) {
      await tx
        .insert(oauthTokens)
        .values({ userId: user.id, encryptedRefreshToken: conn.encryptedRefreshToken, scopes: conn.scopes })
        .onConflictDoUpdate({
          target: oauthTokens.userId,
          set: { encryptedRefreshToken: conn.encryptedRefreshToken, scopes: conn.scopes },
        });
    } else {
      const updated = await tx
        .update(oauthTokens)
        .set({ scopes: conn.scopes })
        .where(eq(oauthTokens.userId, user.id))
        .returning({ id: oauthTokens.id });
      if (updated.length === 0) throw new MissingRefreshTokenError();
    }

    await tx.insert(auditLog).values({
      userId: user.id,
      actor: "web",
      action: "google.connect",
      meta: { scopes: conn.scopes, newRefreshToken: Boolean(conn.encryptedRefreshToken) },
    });
    return { userId: user.id };
  });
}
