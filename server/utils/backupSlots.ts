/**
 * Slot math for scheduled backups, kept free of Nuxt/DB imports so it can be
 * unit-tested directly.
 *
 * Slots are anchored at `atTime` in `timeZone`:
 * - intervals below a day divide it (1–12 h) and repeat from the anchor, so
 *   "every 6 hours at 03:00" means 03:00, 09:00, 15:00 and 21:00 local time;
 * - longer intervals are whole days and count from the day the schedule was
 *   saved, so "every 7 days at 04:00" saved on a Sunday runs on Sundays.
 */

export type SlotSchedule = {
  intervalHours: number;
  atTime: string;
  timeZone: string;
  /** When the schedule was saved; multi-day intervals count from that day. */
  updatedAt: number;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Allowed intervals: divisors of a day, or whole days. */
export const BACKUP_INTERVALS = [1, 2, 3, 4, 6, 8, 12, 24, 48, 72, 168];

/** Offset of `timeZone` from UTC at `instant`, in ms (e.g. +2h for CEST). */
function zoneOffset(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, Number(p.value)])
  );
  const asUtc = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Days since 1970-01-01 on the local calendar of `timeZone`. */
function localDay(instant: number, timeZone: string) {
  return Math.floor((instant + zoneOffset(instant, timeZone)) / DAY_MS);
}

/** The instant `atTime` falls on, on local calendar day `day`. */
function anchorOn(day: number, atTime: string, timeZone: string) {
  const [hours = 0, minutes = 0] = atTime.split(":").map(Number);
  const wallClock = day * DAY_MS + hours * HOUR_MS + minutes * MINUTE_MS;
  // Converting with the offset at a first guess, then once more with the offset
  // at the result, settles DST transition days.
  const guess = wallClock - zoneOffset(wallClock, timeZone);
  return wallClock - zoneOffset(guess, timeZone);
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The latest slot at or before `now`. */
export function previousSlot(schedule: SlotSchedule, now: number) {
  const { intervalHours, atTime, timeZone } = schedule;
  const today = localDay(now, timeZone);

  if (intervalHours < 24) {
    const interval = intervalHours * HOUR_MS;
    const anchor = anchorOn(today, atTime, timeZone);
    // Negative offsets floor into yesterday's slots, which line up because the
    // interval divides the day.
    return anchor + Math.floor((now - anchor) / interval) * interval;
  }

  const days = Math.round(intervalHours / 24);
  const startDay = localDay(schedule.updatedAt, timeZone);
  for (let day = today; day > today - days - 1; day--) {
    const onCycle = (((day - startDay) % days) + days) % days === 0;
    const anchor = anchorOn(day, atTime, timeZone);
    if (onCycle && anchor <= now) return anchor;
  }
  // Unreachable for days >= 1, kept so the return type stays a number.
  return anchorOn(today - days, atTime, timeZone);
}

export function nextSlot(schedule: SlotSchedule, now: number) {
  const previous = previousSlot(schedule, now);
  if (schedule.intervalHours < 24) {
    return previous + schedule.intervalHours * HOUR_MS;
  }
  // Day arithmetic instead of adding hours keeps the wall-clock time across DST.
  const day = localDay(previous, schedule.timeZone);
  return anchorOn(
    day + Math.round(schedule.intervalHours / 24),
    schedule.atTime,
    schedule.timeZone
  );
}

/**
 * Whether a backup is due: a slot has passed since the last run and since the
 * schedule was saved. Enabling "daily at 04:00" at 15:00 waits for tomorrow
 * instead of firing for this morning's slot, and slots missed while MCSM was
 * down collapse into a single catch-up run.
 */
export function isDue(
  schedule: SlotSchedule & { lastRunAt: number | null },
  now: number
) {
  const since = Math.max(schedule.updatedAt, schedule.lastRunAt ?? 0);
  return previousSlot(schedule, now) > since;
}
