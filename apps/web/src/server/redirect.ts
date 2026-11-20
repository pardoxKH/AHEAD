import { NextResponse } from "next/server";
import { getEnv } from "../env";

/** Redirect to an app path. Built from APP_URL, not the request URL, which is internal behind Railway's proxy. */
export function redirectTo(path: string): NextResponse {
  // 303 so a redirect after a form POST is followed with GET.
  return NextResponse.redirect(new URL(path, getEnv().APP_URL), 303);
}
