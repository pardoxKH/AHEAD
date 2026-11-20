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
