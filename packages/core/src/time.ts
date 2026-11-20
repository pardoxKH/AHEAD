/** Working-week settings for the planner. Defaults follow the design doc: Sunday to Thursday, Asia/Riyadh. */
export interface WorkWeek {
  timeZone: string;
  /** 0 = Sunday ... 6 = Saturday */
  workingDays: readonly number[];
  startHour: number;
  endHour: number;
}

export const DEFAULT_WORK_WEEK: WorkWeek = {
  timeZone: "Asia/Riyadh",
  workingDays: [0, 1, 2, 3, 4],
  startHour: 8,
  endHour: 17,
};

/** Day of week (0 = Sunday) of an instant, in the given IANA time zone. */
export function dayOfWeekIn(instant: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(instant);
  const index = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
  if (index < 0) throw new Error(`Unexpected weekday "${name}"`);
  return index;
}

export function isWorkingDay(instant: Date, week: WorkWeek = DEFAULT_WORK_WEEK): boolean {
  return week.workingDays.includes(dayOfWeekIn(instant, week.timeZone));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Moves back `n` working days in the week's time zone, keeping the time of day. A date that falls on a
 * non-working day first rolls back to the previous working day, so `n = 0` means "the last working day
 * on or before `date`". Steps are 24 hours, which is exact in zones without daylight saving (Riyadh).
 */
export function subtractWorkingDays(date: Date, n: number, week: WorkWeek = DEFAULT_WORK_WEEK): Date {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Working days must be a non-negative integer, got ${n}`);
  if (week.workingDays.length === 0) throw new Error("Work week has no working days");
  let t = date.getTime();
  while (!isWorkingDay(new Date(t), week)) t -= DAY_MS;
  for (let left = n; left > 0;) {
    t -= DAY_MS;
    if (isWorkingDay(new Date(t), week)) left--;
  }
  return new Date(t);
}
