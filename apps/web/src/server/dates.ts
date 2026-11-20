// Calendar dates (YYYY-MM-DD) in the user's time zone <-> UTC instants. Storage stays UTC.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar date of `instant` in `timeZone`, as YYYY-MM-DD. */
export function localDate(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** True for a real calendar date in YYYY-MM-DD form. */
export function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const noon = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(noon.getTime()) && noon.toISOString().startsWith(value);
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(instant)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant of `hour`:00 on calendar `date` in `timeZone`. */
export function zonedTimeToUtc(date: string, hour: number, timeZone: string): Date {
  if (!isCalendarDate(date)) throw new Error("date must be a real date in YYYY-MM-DD form");
  const naive = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  // Two passes settle the offset around daylight-saving changes.
  let utc = new Date(naive.getTime() - offsetMs(naive, timeZone));
  utc = new Date(naive.getTime() - offsetMs(utc, timeZone));
  return utc;
}
