import type { NextRequest } from "next/server";
import { getEnv } from "@/env";
import { SESSION_COOKIE, sessionCookieOptions, stateCookieOptions } from "@/server/cookies";
import { saveGoogleConnection } from "@/server/connection-store";
import { getDb } from "@/server/db";
import { completeGoogleSignIn, type CallbackResult } from "@/server/google-callback";
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

  const response = result.ok ? redirectTo("/") : redirectTo(`/signin?error=${result.reason}`);
  response.cookies.set(STATE_COOKIE, "", { ...stateCookieOptions(), maxAge: 0 });
  if (result.ok) {
    response.cookies.set(
      SESSION_COOKIE,
      signSession(result.userId, env.SESSION_SECRET, new Date()),
      sessionCookieOptions(),
    );
  }
  return response;
}
