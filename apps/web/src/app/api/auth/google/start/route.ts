import { NextResponse } from "next/server";
import { BASE_SCOPES, buildAuthUrl } from "@ahead/google";
import { getEnv } from "@/env";
import { stateCookieOptions } from "@/server/cookies";
import { googleClient } from "@/server/google-client";
import { createState, STATE_COOKIE } from "@/server/oauth-state";

export const dynamic = "force-dynamic";

export function GET() {
  const state = createState();
  const url = buildAuthUrl(googleClient(getEnv()), {
    scopes: BASE_SCOPES,
    state,
    includeGrantedScopes: true,
  });
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(STATE_COOKIE, state, stateCookieOptions());
  return response;
}
