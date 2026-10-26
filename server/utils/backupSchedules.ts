import type { H3Event } from "h3";
import { and, desc, eq, gt, gte } from "drizzle-orm";
// Imported explicitly (not via the `db` auto-import): the auto-import's type
// resolves to `any` under pnpm because it references the package by path,
// which bypasses the package's `exports` types.
import { db } from "@nuxthub/db";
import { backupSchedules, backups, statsSamples } from "../db/schema";
import { isDue, nextSlot } from "./backupSlots";

export type BackupSchedule = typeof backupSchedules.$inferSelect;

export type BackupScheduleInput = Pick<
  BackupSchedule,
  "enabled" | "intervalHours" | "atTime" | "timeZone" | "keep" | "onlyIfPlayed"
>;

const DEFAULTS: BackupScheduleInput = {
  enabled: false,
  intervalHours: 24,
  atTime: "04:00",
  timeZone: "UTC",
  keep: 7,
  onlyIfPlayed: true,
};

export async function getBackupSchedule(volume: string) {
  const row = await db
    .select()
    .from(backupSchedules)
    .where(eq(backupSchedules.volume, volume))
    .get();
  const schedule = row ?? {
    ...DEFAULTS,
    volume,
    updatedAt: Date.now(),
    lastRunAt: null,
    lastResult: null,
    lastError: null,
  };
  return {
    ...schedule,
    nextRunAt: schedule.enabled ? nextRunAt(schedule, Date.now()) : null,
  };
}

/** When the next backup runs; a slot that is already due runs with the next sweep. */
function nextRunAt(schedule: BackupSchedule, now: number) {
  return isDue(schedule, now) ? now : nextSlot(schedule, now);
}

export async function saveBackupSchedule(
  volume: string,
  input: BackupScheduleInput
) {
  // Saving restarts the cadence, so the first run is the next slot from now.
  const values = { ...input, updatedAt: Date.now() };
  await db
    .insert(backupSchedules)
    .values({ volume, ...values })
    .onConflictDoUpdate({ target: backupSchedules.volume, set: values });
  return getBackupSchedule(volume);
}

/** Whether anyone was online since `since`, per the analytics sampler. */
async function playedSince(volume: string, since: number) {
  const row = await db
    .select({ t: statsSamples.t })
    .from(statsSamples)
    .where(
      and(
        eq(statsSamples.volume, volume),
        gte(statsSamples.t, since),
        gt(statsSamples.players, 0)
      )
    )
    .limit(1)
    .get();
  return !!row;
}

async function lastAutomaticBackupAt(volume: string) {
  const row = await db
    .select({ createdAt: backups.createdAt })
    .from(backups)
    .where(and(eq(backups.volume, volume), eq(backups.automatic, true)))
    .orderBy(desc(backups.createdAt))
    .limit(1)
    .get();
  return row?.createdAt ?? null;
}

/** Delete automatic backups beyond `keep`, oldest first. Manual ones stay. */
async function pruneAutomaticBackups(
  serverId: string,
  volume: string,
  keep: number
) {
  const automatic = await db
    .select({ id: backups.id })
    .from(backups)
    .where(and(eq(backups.volume, volume), eq(backups.automatic, true)))
    .orderBy(desc(backups.createdAt));
  for (const { id } of automatic.slice(keep)) {
    await deleteBackup(undefined, serverId, id);
  }
}

async function recordRun(
  volume: string,
  result: "done" | "skipped" | "failed",
  error?: string
) {
  await db
    .update(backupSchedules)
    .set({
      lastRunAt: Date.now(),
      lastResult: result,
      lastError: error ?? null,
    })
    .where(eq(backupSchedules.volume, volume));
}

/**
 * Run every schedule whose slot has passed. Backups run one after another:
 * each one tars a whole world, and doing several at once would compete for
 * the same disk.
 */
export async function runDueBackups(now = Date.now()) {
  const schedules = await db
    .select()
    .from(backupSchedules)
    .where(eq(backupSchedules.enabled, true));
  const due = schedules.filter((schedule) => isDue(schedule, now));
  if (!due.length) return;

  const servers = await useDocker().listServers();
  const byVolume = new Map(
    servers.flatMap((server) =>
      server.volume ? [[server.volume, server] as const] : []
    )
  );

  for (const schedule of due) {
    const server = byVolume.get(schedule.volume);
    if (!server) {
      // Server deleted or on another host; keep the schedule for if it returns.
      await recordRun(schedule.volume, "skipped", "Server not found");
      continue;
    }

    try {
      if (schedule.onlyIfPlayed) {
        const since =
          (await lastAutomaticBackupAt(schedule.volume)) ?? schedule.updatedAt;
        if (!(await playedSince(schedule.volume, since))) {
          await recordRun(schedule.volume, "skipped");
          continue;
        }
      }
      await createBackup(undefined, server.id, "Automatic backup", {
        automatic: true,
      });
      await pruneAutomaticBackups(server.id, schedule.volume, schedule.keep);
      await recordRun(schedule.volume, "done");
    } catch (error) {
      const message =
        (error as { statusMessage?: string }).statusMessage ??
        (error instanceof Error ? error.message : String(error));
      console.error(
        `[mcsm] Scheduled backup of ${schedule.volume} failed:`,
        error
      );
      await recordRun(schedule.volume, "failed", message);
    }
  }
}

/** The world volume a schedule route is about; 404/400 like the other backup routes. */
export async function scheduleVolume(event: H3Event, serverId: string) {
  let server: Awaited<ReturnType<ReturnType<typeof useDocker>["getServer"]>>;
  try {
    server = await useDocker(event).getServer(serverId);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
  if (!server.volume) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no world volume to back up",
    });
  }
  return server.volume;
}
