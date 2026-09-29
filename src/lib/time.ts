/** Campus time helpers. The campus runs on Gulf Standard Time (UTC+4, no daylight saving). */

export const CAMPUS_TIME_ZONE = "Asia/Dubai";
const CAMPUS_UTC_OFFSET_MS = 4 * 60 * 60 * 1000;

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const clockWithSeconds = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const shortDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function formatClock(ms: number | string | Date, withSeconds = false): string {
  const date = new Date(ms);
  return (withSeconds ? clockWithSeconds : clock).format(date);
}

export function formatDate(ms: number | string | Date): string {
  return shortDate.format(new Date(ms));
}

export function formatDateTime(ms: number | string | Date): string {
  return `${formatDate(ms)}, ${formatClock(ms)}`;
}

/** Converts a campus wall-clock time on the campus date of `nearMs` into a UTC timestamp. */
export function campusTime(nearMs: number, hours: number, minutes: number, dayOffset = 0): number {
  const local = new Date(nearMs + CAMPUS_UTC_OFFSET_MS);
  return (
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, hours, minutes) -
    CAMPUS_UTC_OFFSET_MS
  );
}

export function campusHour(ms: number): number {
  return new Date(ms + CAMPUS_UTC_OFFSET_MS).getUTCHours();
}

/** "HH:MM" in campus time, for <input type="time">. */
export function toTimeInput(ms: number): string {
  return formatClock(ms);
}
