import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./same-origin";

const APP_URL = "https://ahead.example.com";
const check = (headers: Record<string, string>) => isSameOrigin(new Headers(headers), APP_URL);

describe("isSameOrigin", () => {
  it("allows the app's own Origin", () => {
    expect(check({ origin: "https://ahead.example.com" })).toBe(true);
  });

  it("falls back to a same-origin Referer when Origin is absent or null", () => {
    expect(check({ referer: "https://ahead.example.com/settings/delete" })).toBe(true);
    expect(check({ origin: "null", referer: "https://ahead.example.com/" })).toBe(true);
  });

  it.each([
    ["another site", { origin: "https://evil.example.com" }],
    ["another scheme", { origin: "http://ahead.example.com" }],
    ["another port", { origin: "https://ahead.example.com:8443" }],
    ["a look-alike host", { origin: "https://ahead.example.com.evil.test" }],
    ["a cross-origin Referer", { referer: "https://evil.example.com/ahead.example.com" }],
    [
      "a cross-origin Origin with a same-origin Referer",
      {
        origin: "https://evil.example.com",
        referer: "https://ahead.example.com/",
      },
    ],
    ["a malformed Referer", { referer: "not a url" }],
  ])("rejects %s", (_, headers) => {
    expect(check(headers)).toBe(false);
  });

  it("rejects a request with neither header", () => {
    expect(check({})).toBe(false);
    expect(check({ origin: "null" })).toBe(false);
  });
});
