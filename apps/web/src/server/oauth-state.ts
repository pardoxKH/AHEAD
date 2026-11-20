import { randomBytes, timingSafeEqual } from "node:crypto";

export const STATE_COOKIE = "ahead_oauth_state";
export const STATE_TTL_SECONDS = 10 * 60;

export function createState(): string {
  return randomBytes(32).toString("base64url");
}

/** True only when the state Google echoed back matches the one in our cookie. */
export function checkState(cookieState: string | undefined, returnedState: string | null): boolean {
  if (!cookieState || !returnedState) return false;
  const a = Buffer.from(cookieState);
  const b = Buffer.from(returnedState);
  return a.length === b.length && timingSafeEqual(a, b);
}
