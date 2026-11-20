import type { NextRequest } from "next/server";
import { getEnv } from "@/env";
import { SESSION_COOKIE, sessionCookieOptions, stateCookieOptions } from "@/server/cookies";
import { saveGoogleConnection } from "@/server/connection-store";
import { getDb } from "@/server/db";
import { completeGoogleSignIn, type CallbackResult } from "@/server/google-callback";
import { NEXT_COOKIE, safeNextPath, withParam } from "@/server/next-path";
import { STATE_COOKIE } from "@/server/oauth-state";
import { redirectTo } from "@/server/redirect";
import { signSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const env = getEnv();
  const params = request.nextUrl.searchParams;

  let result: CallbackResult;
  try {
    result = await completeGoogleSignIn(
      {
        code: params.get("code"),
        returnedState: params.get("state"),
        cookieState: request.cookies.get(STATE_COOKIE)?.value,
        error: params.get("error"),
      },
      { env, saveConnection: (conn) => saveGoogleConnection(getDb(), conn) },
    );
  } catch (err) {
    // Never log the error itself: token exchange errors can carry request details.
    console.error("Google sign-in failed:", (err as Error).name);
    result = { ok: false, reason: "failed" };
  }

  // An incremental consent started from a page returns there; the path is validated again here.
  const next = safeNextPath(request.cookies.get(NEXT_COOKIE)?.value);
  let target = result.ok ? "/" : `/signin?error=${result.reason}`;
  if (next) target = result.ok ? next : withParam(next, "consent", result.reason);

  const response = redirectTo(target);
  response.cookies.set(STATE_COOKIE, "", { ...stateCookieOptions(), maxAge: 0 });
  response.cookies.set(NEXT_COOKIE, "", { ...stateCookieOptions(), maxAge: 0 });
  if (result.ok) {
    response.cookies.set(
      SESSION_COOKIE,
      signSession(result.userId, env.SESSION_SECRET, new Date()),
      sessionCookieOptions(),
    );
  }
  return response;
}
