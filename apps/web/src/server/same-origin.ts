import { NextResponse } from "next/server";

const originOf = (value: string): string | null => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

/**
 * CSRF check for state-changing route handlers: the request's Origin (or, when a browser omits it,
 * its Referer) must be the app's own origin. A request carrying neither is refused.
 * Server Actions get the same check from Next itself; plain route handlers do not, hence this.
 */
export function isSameOrigin(headers: Headers, appUrl: string): boolean {
  const expected = originOf(appUrl);
  const origin = headers.get("origin");
  // Some browsers send the literal "null" for privacy-sensitive contexts; treat it as missing.
  const source = origin && origin !== "null" ? origin : headers.get("referer");
  return expected !== null && source !== null && originOf(source) === expected;
}

export const forbidden = () => new NextResponse("Forbidden", { status: 403 });
