import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/env";
import { SESSION_COOKIE } from "@/server/cookies";
import { isPublicPath } from "@/server/public-paths";
import { verifySession } from "@/server/session";

// Every route needs a valid session except the public ones. Pages check again when loading the user.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const env = getEnv();
  const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value, env.SESSION_SECRET, new Date());
  if (session) return NextResponse.next();
  return NextResponse.redirect(new URL("/signin", env.APP_URL), 303);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
