import { describe, expect, it } from "vitest";
import { safeNextPath, withParam } from "./next-path";

describe("safeNextPath", () => {
  it.each([
    ["/import", "/import"],
    ["/import?doc=https%3A%2F%2Fdocs.google.com%2Fdocument%2Fd%2Fabc%2Fedit", undefined],
    ["/import/review", "/import/review"],
    ["/a/../import", "/import"],
  ])("accepts the same-site path %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected ?? raw);
  });

  it.each([
    null,
    undefined,
    "",
    "import",
    "https://evil.example.com/",
    "//evil.example.com/import",
    "/\\evil.example.com",
    "/\t/evil.example.com",
    "/\n/evil.example.com",
    "javascript:alert(1)",
    "/api/auth/google/start",
    "/api/auth",
    `/${"a".repeat(2048)}`,
  ])("rejects %j", (raw) => {
    expect(safeNextPath(raw)).toBeNull();
  });
});

describe("withParam", () => {
  it("adds or replaces a query parameter", () => {
    expect(withParam("/import?doc=x", "consent", "denied")).toBe("/import?doc=x&consent=denied");
    expect(withParam("/import?consent=a", "consent", "b")).toBe("/import?consent=b");
  });
});
