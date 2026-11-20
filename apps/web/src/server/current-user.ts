import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { oauthTokens, users } from "@ahead/db";
import { getEnv } from "../env";
import { SESSION_COOKIE } from "./cookies";
import { getDb } from "./db";
import { verifySession } from "./session";

/** The signed-in user's id, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token, getEnv().SESSION_SECRET, new Date())?.userId ?? null;
}

/** Loads the signed-in user and their granted scopes, or redirects to /signin. */
export async function requireUser() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/signin");
  const [row] = await getDb()
    .select({ user: users, scopes: oauthTokens.scopes })
    .from(users)
    .leftJoin(oauthTokens, eq(oauthTokens.userId, users.id))
    .where(eq(users.id, userId));
  // A valid cookie for a deleted user: treat as signed out.
  if (!row) redirect("/signin");
  return { ...row.user, scopes: row.scopes ?? [] };
}
