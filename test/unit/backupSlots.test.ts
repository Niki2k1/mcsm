import { describe, expect, it } from "vitest";
import {
  isDue,
  isValidTimeZone,
  nextSlot,
  previousSlot,
} from "../../server/utils/backupSlots";

const at = (iso: string) => Date.parse(iso);
const berlin = { timeZone: "Europe/Berlin", atTime: "04:00" };

describe("previousSlot / nextSlot", () => {
  it("anchors daily slots at the local time", () => {
    const schedule = {
      ...berlin,
      intervalHours: 24,
      updatedAt: at("2026-10-20T10:00:00Z"),
    };
    // 04:00 CEST = 02:00 UTC
    expect(previousSlot(schedule, at("2026-10-24T12:00:00Z"))).toBe(
      at("2026-10-24T02:00:00Z")
    );
    expect(nextSlot(schedule, at("2026-10-24T12:00:00Z"))).toBe(
      at("2026-10-25T03:00:00Z")
    );
  });

  it("uses yesterday's slot before today's time", () => {
    const schedule = {
      ...berlin,
      intervalHours: 24,
      updatedAt: at("2026-10-20T10:00:00Z"),
    };
    expect(previousSlot(schedule, at("2026-10-24T01:00:00Z"))).toBe(
      at("2026-10-23T02:00:00Z")
    );
  });

  it("keeps the wall-clock time across the DST change", () => {
    const schedule = {
      ...berlin,
      intervalHours: 24,
      updatedAt: at("2026-10-20T10:00:00Z"),
    };
    // DST ends 2026-10-25 03:00 CEST → 04:00 is CET (UTC+1) that day.
    expect(previousSlot(schedule, at("2026-10-25T12:00:00Z"))).toBe(
      at("2026-10-25T03:00:00Z")
    );
  });

  it("repeats sub-daily intervals from the anchor", () => {
    const schedule = {
      timeZone: "UTC",
      atTime: "03:00",
      intervalHours: 6,
      updatedAt: 0,
    };
    expect(previousSlot(schedule, at("2026-10-24T14:30:00Z"))).toBe(
      at("2026-10-24T09:00:00Z")
    );
    expect(previousSlot(schedule, at("2026-10-24T01:00:00Z"))).toBe(
      at("2026-10-23T21:00:00Z")
    );
    expect(nextSlot(schedule, at("2026-10-24T14:30:00Z"))).toBe(
      at("2026-10-24T15:00:00Z")
    );
  });

  it("counts multi-day intervals from the day the schedule was saved", () => {
    const schedule = {
      timeZone: "UTC",
      atTime: "04:00",
      intervalHours: 72,
      updatedAt: at("2026-10-20T10:00:00Z"),
    };
    // Cycle days: 20th, 23rd, 26th …
    expect(previousSlot(schedule, at("2026-10-25T12:00:00Z"))).toBe(
      at("2026-10-23T04:00:00Z")
    );
    expect(previousSlot(schedule, at("2026-10-23T03:00:00Z"))).toBe(
      at("2026-10-20T04:00:00Z")
    );
    expect(nextSlot(schedule, at("2026-10-25T12:00:00Z"))).toBe(
      at("2026-10-26T04:00:00Z")
    );
  });
});

describe("isDue", () => {
  const schedule = {
    timeZone: "UTC",
    atTime: "04:00",
    intervalHours: 24,
    updatedAt: at("2026-10-24T15:00:00Z"),
    lastRunAt: null,
  };

  it("doesn't fire for a slot before the schedule was saved", () => {
    expect(isDue(schedule, at("2026-10-24T15:01:00Z"))).toBe(false);
  });

  it("fires once the next slot passed", () => {
    expect(isDue(schedule, at("2026-10-25T04:00:30Z"))).toBe(true);
  });

  it("doesn't fire twice for the same slot", () => {
    const ran = { ...schedule, lastRunAt: at("2026-10-25T04:00:30Z") };
    expect(isDue(ran, at("2026-10-25T10:00:00Z"))).toBe(false);
    expect(isDue(ran, at("2026-10-26T04:01:00Z"))).toBe(true);
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
