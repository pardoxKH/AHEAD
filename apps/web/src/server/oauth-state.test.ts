import { describe, expect, it } from "vitest";
import { checkState, createState } from "./oauth-state";

describe("oauth state", () => {
  it("creates distinct, URL-safe values", () => {
    const a = createState();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(createState()).not.toBe(a);
  });

  it("accepts only the state stored in the cookie", () => {
    const state = createState();
    expect(checkState(state, state)).toBe(true);
    expect(checkState(state, createState())).toBe(false);
    expect(checkState(state, state.slice(1))).toBe(false);
  });

  it("rejects a missing cookie or missing returned state", () => {
    const state = createState();
    expect(checkState(undefined, state)).toBe(false);
    expect(checkState(state, null)).toBe(false);
    expect(checkState("", "")).toBe(false);
  });
});
