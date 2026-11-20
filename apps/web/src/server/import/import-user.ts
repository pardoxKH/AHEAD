import { eq } from "drizzle-orm";
import { oauthTokens, users, type Db } from "@ahead/db";
import type { ImportUser } from "./run-import";

/** The user's settings and stored Google token, or null when either is missing. */
export async function loadImportUser(db: Db, userId: string): Promise<ImportUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      timeZone: users.timeZone,
      dayEndHour: users.dayEndHour,
      scopes: oauthTokens.scopes,
      encryptedRefreshToken: oauthTokens.encryptedRefreshToken,
    })
    .from(users)
    .innerJoin(oauthTokens, eq(oauthTokens.userId, users.id))
    .where(eq(users.id, userId));
  return row ?? null;
}
