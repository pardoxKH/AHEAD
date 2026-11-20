import { SESSION_TTL_MS } from "./session";
import { STATE_TTL_SECONDS } from "./oauth-state";

export const SESSION_COOKIE = "ahead_session";

const base = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
});

export const sessionCookieOptions = () => ({ ...base(), path: "/", maxAge: SESSION_TTL_MS / 1000 });

// Scoped to the OAuth routes; only needed for the round trip to Google.
export const stateCookieOptions = () => ({ ...base(), path: "/api/auth/google", maxAge: STATE_TTL_SECONDS });
