// Paths reachable without a session. /api/health is public so Railway's healthcheck can reach it.
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/signin" ||
    pathname === "/api/health" ||
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/")
  );
}
