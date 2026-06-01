import { desc, eq } from "drizzle-orm";
// Imported explicitly (not via the `db` auto-import): the auto-import's type
// resolves to `any` under pnpm because it references the package by path,
// which bypasses the package's `exports` types.
import { db } from "@nuxthub/db";
import { activityEvents } from "../db/schema";

export type ActivityAction =
  | "created"
  | "started"
  | "stopped"
  | "restarted"
  | "edited"
  | "deleted"
  | "backup-created"
  | "backup-restored"
  | "backup-deleted"
  | "pregen-started"
  | "pregen-completed"
  | "pregen-cancelled";

/**
 * Record a server lifecycle event. Events are keyed by the world volume name —
 * the only identifier that survives container recreation on config edits.
 *
 * Recording is best-effort: a failure here must never break the operation that
 * triggered it.
 */
export async function recordActivity(
  volume: string | null | undefined,
  action: ActivityAction,
  detail?: string
) {
  if (!volume) return;
  try {
    await db.insert(activityEvents).values({
      volume,
      t: Date.now(),
      action,
      detail: detail ?? null,
    });
  } catch (error) {
    console.error("[mcsm] Failed to record activity event:", error);
  }
}

/** Most recent events for a server's volume, newest first. */
export async function listActivity(volume: string, limit = 50) {
  return db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.volume, volume))
    .orderBy(desc(activityEvents.t))
    .limit(limit);
}
