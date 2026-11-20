import { NextResponse, type NextRequest } from "next/server";
import { BASE_SCOPES, buildAuthUrl, IMPORT_SCOPES } from "@ahead/google";
import { getEnv } from "@/env";
import { stateCookieOptions } from "@/server/cookies";
import { googleClient } from "@/server/google-client";
import { NEXT_COOKIE, safeNextPath } from "@/server/next-path";
import { createState, STATE_COOKIE } from "@/server/oauth-state";

export const dynamic = "force-dynamic";

// `?scopes=import` asks incrementally for the Docs import scope; openid and email are kept so the
// callback can still verify the account. `?next=` is where to land afterwards (same-site paths only).
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const scopes = params.get("scopes") === "import" ? ["openid", "email", ...IMPORT_SCOPES] : BASE_SCOPES;
  const next = safeNextPath(params.get("next"));

  const state = createState();
  const url = buildAuthUrl(googleClient(getEnv()), { scopes, state, includeGrantedScopes: true });
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(STATE_COOKIE, state, stateCookieOptions());
  if (next) response.cookies.set(NEXT_COOKIE, next, stateCookieOptions());
  else response.cookies.set(NEXT_COOKIE, "", { ...stateCookieOptions(), maxAge: 0 });
  return response;
}
