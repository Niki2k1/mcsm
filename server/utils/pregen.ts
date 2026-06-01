import { eq } from "drizzle-orm";
// Imported explicitly (not via the `db` auto-import): the auto-import's type
// resolves to `any` under pnpm because it references the package by path,
// which bypasses the package's `exports` types.
import { db } from "@nuxthub/db";
import type { Rcon } from "rcon-client";
import { pregenTasks } from "../db/schema";

/**
 * World pre-generation via the Chunky plugin/mod.
 *
 * Chunky (https://modrinth.com/mod/chunky) is installed through the itzg
 * image's MODRINTH_PROJECTS auto-install and driven entirely over RCON. All
 * Chunky knowledge — command sequences, console-output parsing and the task
 * state stored per world volume — lives in this module.
 */

/** Modrinth slug installed via MODRINTH_PROJECTS. */
export const CHUNKY_SLUG = "chunky";

/**
 * Server types that can load Chunky. Matches the loaders Chunky publishes on
 * Modrinth (paper/fabric/forge); the remaining MCSM types either have no mod
 * loader (VANILLA) or manage their own mod list (FTBA, AUTO_CURSEFORGE).
 */
export const PREGEN_SUPPORTED_TYPES = ["PAPER", "FABRIC", "FORGE"] as const;

/** Chunky pre-generates the overworld only in MCSM v1. */
const PREGEN_WORLD = "minecraft:overworld";

export type PregenTask = typeof pregenTasks.$inferSelect;
export type PregenTaskPatch = Partial<typeof pregenTasks.$inferInsert>;

export type PregenState =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

// ---------------------------------------------------------------------------
// Pure helpers (no I/O)
// ---------------------------------------------------------------------------

export function serverTypeSupportsPregen(type: string | null | undefined) {
  return (PREGEN_SUPPORTED_TYPES as readonly string[]).includes(type ?? "");
}

/**
 * Whether Chunky is already in a MODRINTH_PROJECTS value. Tolerates the
 * version/loader suffixes itzg supports (e.g. `chunky:beta`, `chunky:1.4.40`).
 */
export function hasChunky(projects: string | null | undefined): boolean {
  return hasModrinthProject(projects, CHUNKY_SLUG);
}

/** Append Chunky to a MODRINTH_PROJECTS value (no-op when already present). */
export function addChunky(projects: string | null | undefined): string {
  return addModrinthProject(projects, CHUNKY_SLUG);
}

/**
 * Chunk-grid dimensions of a square pre-generation area. Chunky generates a
 * square of `2 * ceil(radius / 16) + 1` chunks per side, centered on the
 * starting chunk.
 */
export function radiusToChunkCount(radiusBlocks: number) {
  const chunkRadius = Math.ceil(radiusBlocks / 16);
  const sideChunks = 2 * chunkRadius + 1;
  return { sideChunks, totalChunks: sideChunks * sideChunks };
}

export type ChunkyProgress = {
  /** A task is actively generating chunks. */
  running: boolean;
  /** A task exists but is paused. */
  paused: boolean;
  /** The task finished (100%). */
  done: boolean;
  processed: number | null;
  percent: number | null;
  etaSeconds: number | null;
  /** Generation rate in chunks per second. */
  rate: number | null;
  /** Chunk position Chunky is currently working on. */
  current: { x: number; z: number } | null;
  /** Cleaned response text, for logging/debugging. */
  raw: string;
};

/** Strip Minecraft § formatting codes from console/RCON output. */
export function stripMinecraftFormatting(text: string): string {
  return text.replace(/§[0-9a-fk-or]/gi, "");
}

/** Parse a Chunky ETA like "1:02:34" or "12:34" into seconds. */
export function parseEta(eta: string): number | null {
  const parts = eta.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * Parse `chunky progress` / periodic update output, e.g.:
 *
 *   "[Chunky] Task running for minecraft:overworld. Processed: 14256 chunks
 *    (28.46%), ETA: 0:05:18, Rate: 224.5 cps, Current: 35, -41"
 *   "[Chunky] Task finished for minecraft:overworld. Processed: 50097 chunks
 *    (100.00%), Total time: 0:03:43"
 *
 * Every field is matched independently so wording changes between Chunky
 * versions degrade gracefully instead of breaking the whole reading.
 */
export function parseChunkyProgress(response: string): ChunkyProgress {
  const text = stripMinecraftFormatting(response);

  const processed = /processed:\s*([\d,]+)\s*chunks/i.exec(text);
  const percent = /\(([\d.]+)\s*%\)/.exec(text);
  const eta = /eta:\s*([\d:]+)/i.exec(text);
  const rate = /rate:\s*([\d.]+)\s*cps/i.exec(text);
  const current = /current:\s*(-?\d+),\s*(-?\d+)/i.exec(text);

  const done = /task\s+finished/i.test(text);
  const running = !done && /task\s+running/i.test(text);
  const paused = !done && !running && /task\s+(paused|stopped)/i.test(text);

  return {
    running,
    paused,
    done,
    processed: processed ? Number(processed[1]!.replace(/,/g, "")) : null,
    percent: percent ? Number(percent[1]) : null,
    etaSeconds: eta ? parseEta(eta[1]!) : null,
    rate: rate ? Number(rate[1]) : null,
    current: current
      ? { x: Number(current[1]), z: Number(current[2]) }
      : null,
    raw: text.trim(),
  };
}

// ---------------------------------------------------------------------------
// Chunky RCON commands (run inside a withRcon callback)
// ---------------------------------------------------------------------------

export async function chunkyStart(
  rcon: Rcon,
  opts: { centerX: number; centerZ: number; radiusBlocks: number }
) {
  await rcon.send(`chunky world ${PREGEN_WORLD}`);
  await rcon.send("chunky shape square");
  await rcon.send(`chunky center ${opts.centerX} ${opts.centerZ}`);
  await rcon.send(`chunky radius ${opts.radiusBlocks}`);
  return rcon.send("chunky start");
}

export async function chunkyPause(rcon: Rcon) {
  return rcon.send("chunky pause");
}

export async function chunkyContinue(rcon: Rcon) {
  return rcon.send("chunky continue");
}

/** Cancel discards saved progress, so Chunky asks for confirmation. */
export async function chunkyCancel(rcon: Rcon) {
  const response = await rcon.send("chunky cancel");
  if (/confirm/i.test(response)) return rcon.send("chunky confirm");
  return response;
}

export async function chunkyProgress(rcon: Rcon): Promise<ChunkyProgress> {
  return parseChunkyProgress(await rcon.send("chunky progress"));
}

// ---------------------------------------------------------------------------
// Stored task state (one row per world volume)
// ---------------------------------------------------------------------------

export async function getPregenTask(
  volume: string
): Promise<PregenTask | null> {
  const rows = await db
    .select()
    .from(pregenTasks)
    .where(eq(pregenTasks.volume, volume))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertPregenTask(
  volume: string,
  patch: PregenTaskPatch
): Promise<PregenTask> {
  const updatedAt = Date.now();
  await db
    .insert(pregenTasks)
    .values({ volume, updatedAt, ...patch })
    .onConflictDoUpdate({
      target: pregenTasks.volume,
      set: { ...patch, updatedAt },
    });
  return (await getPregenTask(volume))!;
}

/**
 * Merge a live Chunky reading into the stored task and return the updated row.
 *
 * Reconciliation rules: a finished task always wins (and records a one-time
 * "pregen-completed" activity event); live running/paused win over stale
 * stored state; an *empty* live reading (no task in Chunky) never downgrades
 * stored state — the server may simply be mid-restart.
 */
export async function applyChunkyProgress(
  volume: string,
  progress: ChunkyProgress
): Promise<PregenTask | null> {
  const existing = await getPregenTask(volume);

  // Nothing stored and nothing live — don't create ghost rows.
  if (!existing && !progress.running && !progress.paused && !progress.done) {
    return null;
  }

  const patch: PregenTaskPatch = {};
  if (progress.processed !== null) patch.processedChunks = progress.processed;
  if (progress.percent !== null) patch.percent = progress.percent;
  if (progress.rate !== null) patch.rate = progress.rate;
  if (progress.etaSeconds !== null) patch.etaSeconds = progress.etaSeconds;
  if (progress.current) {
    patch.currentX = progress.current.x;
    patch.currentZ = progress.current.z;
  }

  if (progress.done) {
    patch.state = "completed";
    patch.percent = 100;
    patch.etaSeconds = 0;
    if (!existing?.completedAt) patch.completedAt = Date.now();
  } else if (progress.running) {
    patch.state = "running";
  } else if (progress.paused) {
    patch.state = "paused";
  }

  const updated = await upsertPregenTask(volume, patch);

  // Record completion exactly once (guarded by the previously stored state).
  if (progress.done && existing?.state !== "completed") {
    await recordActivity(
      volume,
      "pregen-completed",
      `Pre-generated ${updated.processedChunks.toLocaleString()} chunks` +
        (updated.radius ? ` (radius ${updated.radius})` : "")
    );
  }

  return updated;
}
