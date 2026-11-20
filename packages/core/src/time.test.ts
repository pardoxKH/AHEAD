import { describe, expect, it } from "vitest";
import { dayOfWeekIn, isWorkingDay } from "./time.js";

describe("working week", () => {
  it("uses the configured time zone, not UTC", () => {
    // 2026-11-19 22:30 UTC is already Friday 01:30 in Riyadh.
    const instant = new Date("2026-11-19T22:30:00Z");
    expect(dayOfWeekIn(instant, "UTC")).toBe(4);
    expect(dayOfWeekIn(instant, "Asia/Riyadh")).toBe(5);
  });

  it("treats Sunday to Thursday as working days by default", () => {
    expect(isWorkingDay(new Date("2026-11-22T09:00:00+03:00"))).toBe(true); // Sunday
    expect(isWorkingDay(new Date("2026-11-26T09:00:00+03:00"))).toBe(true); // Thursday
    expect(isWorkingDay(new Date("2026-11-27T09:00:00+03:00"))).toBe(false); // Friday
    expect(isWorkingDay(new Date("2026-11-28T09:00:00+03:00"))).toBe(false); // Saturday
  });
});
