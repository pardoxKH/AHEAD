// Where to send the user after an OAuth round trip. Only same-site relative paths are accepted,
// so a crafted `next` can never turn the callback into an open redirect.

export const NEXT_COOKIE = "ahead_oauth_next";

const MAX_LENGTH = 2048;
const BASE = "http://ahead.invalid";

/** Returns the path (with query) when `raw` is a safe same-site relative path, otherwise null. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_LENGTH) return null;
  // Must be rooted, and not protocol-relative ("//host") or a backslash trick ("/\host").
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // Browsers treat "\" like "/" and strip tabs and newlines, so reject them and other control chars.
  if ([...raw].some((ch) => ch === "\\" || ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)) return null;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  // Never bounce back into the OAuth routes themselves.
  if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) return null;
  return `${url.pathname}${url.search}`;
}

/** Appends one query parameter to a safe path. */
export function withParam(path: string, name: string, value: string): string {
  const url = new URL(path, BASE);
  url.searchParams.set(name, value);
  return `${url.pathname}${url.search}`;
}
