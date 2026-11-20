import { OAuth2Client } from "google-auth-library";
import { loadEncryptionKey } from "@ahead/google";
import { getEnv } from "@/env";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/cookies";
import { getSessionUserId } from "@/server/current-user";
import { getDb } from "@/server/db";
import { DELETE_CONFIRMATION, deleteAccount } from "@/server/delete-account";
import { redirectTo } from "@/server/redirect";
import { forbidden, isSameOrigin } from "@/server/same-origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const env = getEnv();
  if (!isSameOrigin(request.headers, env.APP_URL)) return forbidden();

  const userId = await getSessionUserId();
  if (!userId) return redirectTo("/signin");

  const form = await request.formData();
  if (form.get("confirm") !== DELETE_CONFIRMATION) return redirectTo("/settings/delete?error=confirm");

  const { revocation } = await deleteAccount(userId, {
    db: getDb(),
    encryptionKey: loadEncryptionKey({ TOKEN_ENCRYPTION_KEY: env.TOKEN_ENCRYPTION_KEY }),
    revokeToken: (token) => new OAuth2Client().revokeToken(token),
  });

  const response = redirectTo(`/signin?deleted=${revocation}`);
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
