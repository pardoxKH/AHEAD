import { describe, expect, it } from "vitest";
import { isCalendarDate, localDate, zonedTimeToUtc } from "./dates";

describe("dates", () => {
  it("gives the calendar date in the user's time zone", () => {
    const lateUtc = new Date("2026-11-20T22:30:00Z");
    expect(localDate(lateUtc, "UTC")).toBe("2026-11-20");
    expect(localDate(lateUtc, "Asia/Riyadh")).toBe("2026-11-21");
  });

  it("converts a local date and hour to UTC and back", () => {
    expect(zonedTimeToUtc("2026-11-22", 17, "Asia/Riyadh").toISOString()).toBe("2026-11-22T14:00:00.000Z");
    // Across a daylight-saving change.
    expect(zonedTimeToUtc("2026-07-01", 9, "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(localDate(zonedTimeToUtc("2026-03-29", 17, "Europe/London"), "Europe/London")).toBe("2026-03-29");
  });

  it("checks calendar dates", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-2-3")).toBe(false);
    expect(() => zonedTimeToUtc("nope", 17, "UTC")).toThrow();
  });
});
