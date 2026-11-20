import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it.each([
    "/signin",
    "/api/health",
    "/api/auth/google/start",
    "/api/auth/google/callback",
    "/api/auth/signout",
  ])("lets %s through without a session", (path) => expect(isPublicPath(path)).toBe(true));

  it.each(["/", "/settings", "/settings/delete", "/api/account/delete", "/signin-other", "/api/authx"])(
    "requires a session for %s",
    (path) => expect(isPublicPath(path)).toBe(false),
  );
});
