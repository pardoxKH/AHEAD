import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_WEEK, dayOfWeekIn, isWorkingDay, subtractWorkingDays, type WorkWeek } from "./time.js";

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

describe("subtractWorkingDays", () => {
  const deadline = new Date("2026-12-15T17:00:00+03:00"); // Tuesday in Riyadh
  const back = (n: number, from = deadline, week?: WorkWeek) =>
    subtractWorkingDays(from, n, week).toISOString();

  it("counts back over the Friday-Saturday weekend, keeping the time of day", () => {
    expect(back(0)).toBe("2026-12-15T14:00:00.000Z");
    expect(back(1)).toBe("2026-12-14T14:00:00.000Z"); // Monday
    expect(back(2)).toBe("2026-12-13T14:00:00.000Z"); // Sunday
    expect(back(3)).toBe("2026-12-10T14:00:00.000Z"); // Thursday
    expect(back(10)).toBe("2026-12-01T14:00:00.000Z");
  });

  it("rolls a weekend date back to Thursday before counting", () => {
    const saturday = new Date("2026-12-12T09:00:00+03:00");
    expect(back(0, saturday)).toBe("2026-12-10T06:00:00.000Z");
    expect(back(1, saturday)).toBe("2026-12-09T06:00:00.000Z");
  });

  it("decides the day in the week's time zone around midnight", () => {
    const fridayInRiyadh = new Date("2026-11-19T22:30:00Z"); // Friday 01:30 Riyadh, Thursday in UTC
    expect(back(0, fridayInRiyadh)).toBe("2026-11-18T22:30:00.000Z"); // Thursday 01:30 Riyadh
    expect(back(0, fridayInRiyadh, { ...DEFAULT_WORK_WEEK, timeZone: "UTC" })).toBe(
      "2026-11-19T22:30:00.000Z",
    );

    const lastMinuteThursday = new Date("2026-11-19T20:59:00Z"); // Thursday 23:59 Riyadh
    expect(back(0, lastMinuteThursday)).toBe("2026-11-19T20:59:00.000Z");
    expect(back(1, lastMinuteThursday)).toBe("2026-11-18T20:59:00.000Z");
  });

  it("follows a custom work week", () => {
    const monFri: WorkWeek = { ...DEFAULT_WORK_WEEK, timeZone: "UTC", workingDays: [1, 2, 3, 4, 5] };
    const monday = new Date("2026-12-14T09:00:00Z");
    expect(back(1, monday, monFri)).toBe("2026-12-11T09:00:00.000Z"); // Friday
  });

  it("rejects bad input", () => {
    expect(() => back(-1)).toThrow(/non-negative integer/);
    expect(() => back(1.5)).toThrow(/non-negative integer/);
    expect(() => back(1, deadline, { ...DEFAULT_WORK_WEEK, workingDays: [] })).toThrow(/no working days/);
  });
});
