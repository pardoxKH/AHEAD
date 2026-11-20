import { getEnv } from "@/env";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/cookies";
import { redirectTo } from "@/server/redirect";
import { forbidden, isSameOrigin } from "@/server/same-origin";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  if (!isSameOrigin(request.headers, getEnv().APP_URL)) return forbidden();
  const response = redirectTo("/signin");
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
