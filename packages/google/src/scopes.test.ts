import { describe, expect, it } from "vitest";
import { ALL_SCOPES, BASE_SCOPES, IMPORT_SCOPES } from "./scopes.js";

const FORBIDDEN = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

describe("scopes", () => {
  it.each(FORBIDDEN)("never requests %s", (scope) => {
    expect(ALL_SCOPES).not.toContain(scope);
  });

  it("has no scope that sends mail or writes arbitrary calendars", () => {
    for (const scope of ALL_SCOPES) {
      expect(scope).not.toMatch(/mail\.google\.com|gmail\.(send|modify|insert|metadata)$/);
      expect(scope).not.toMatch(/\/auth\/calendar(\.events)?$/);
    }
  });

  it("asks for Docs only during import", () => {
    expect(BASE_SCOPES.some((s) => s.includes("documents"))).toBe(false);
    expect(IMPORT_SCOPES).toEqual(["https://www.googleapis.com/auth/documents.readonly"]);
  });
});
