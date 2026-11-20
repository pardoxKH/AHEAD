import { SESSION_COOKIE, sessionCookieOptions } from "@/server/cookies";
import { redirectTo } from "@/server/redirect";

export const dynamic = "force-dynamic";

export function POST() {
  const response = redirectTo("/signin");
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
