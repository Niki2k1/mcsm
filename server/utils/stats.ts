import { and, asc, eq, gte, lt } from "drizzle-orm";
// Imported explicitly (not via the `db` auto-import): the auto-import's type
// resolves to `any` under pnpm because it references the package by path,
// which bypasses the package's `exports` types.
import { db } from "@nuxthub/db";
import { statsSamples } from "../db/schema";
import type Docker from "dockerode";

/**
 * Container + Minecraft metrics, sampled by server/plugins/stats-sampler.ts
 * and read by the Analytics tab. Samples are keyed by world volume so history
 * survives container recreation on config edits.
 */

/** One-shot Docker stats reading reduced to the numbers we chart. */
export type ContainerStats = {
  cpu: number | null;
  memUsed: number | null;
  memLimit: number | null;
  netRx: number | null;
  netTx: number | null;
};

// The Docker stats payload is large and untyped in dockerode (`stats()` returns
// a fixed interface that misses several runtime fields), so we go through a
// minimal structural type instead.
type RawStats = {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number; percpu_usage?: number[] };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats?: {
    cpu_usage?: { total_usage?: number };
    system_cpu_usage?: number;
  };
  memory_stats?: { usage?: number; limit?: number };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
};

/** Standard Docker CPU % formula: usage delta over system delta across cores. */
export function computeCpuPercent(stats: RawStats): number | null {
  const cpuDelta =
    (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) -
    (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta =
    (stats.cpu_stats?.system_cpu_usage ?? 0) -
    (stats.precpu_stats?.system_cpu_usage ?? 0);
  const onlineCpus =
    stats.cpu_stats?.online_cpus ||
    stats.cpu_stats?.cpu_usage?.percpu_usage?.length ||
    1;

  if (systemDelta <= 0 || cpuDelta < 0) return null;
  return (cpuDelta / systemDelta) * onlineCpus * 100;
}

/** Read a one-shot stats sample for a container. */
export async function readContainerStats(
  docker: Docker,
  containerId: string
): Promise<ContainerStats> {
  const stats = (await docker
    .getContainer(containerId)
    .stats({ stream: false })) as RawStats;

  let netRx = 0;
  let netTx = 0;
  for (const network of Object.values(stats.networks ?? {})) {
    netRx += network.rx_bytes ?? 0;
    netTx += network.tx_bytes ?? 0;
  }

  return {
    cpu: computeCpuPercent(stats),
    memUsed: stats.memory_stats?.usage ?? null,
    memLimit: stats.memory_stats?.limit ?? null,
    netRx,
    netTx,
  };
}

export type SampleInsert = typeof statsSamples.$inferInsert;

export async function insertSample(sample: SampleInsert) {
  await db.insert(statsSamples).values(sample);
}

/** Samples for a volume since a timestamp, oldest first (chart order). */
export async function getStatsHistory(volume: string, sinceMs: number) {
  return db
    .select()
    .from(statsSamples)
    .where(and(eq(statsSamples.volume, volume), gte(statsSamples.t, sinceMs)))
    .orderBy(asc(statsSamples.t));
}

/** Drop samples older than the retention window (called after each sweep). */
export async function pruneStatsSamples(olderThanMs: number) {
  await db.delete(statsSamples).where(lt(statsSamples.t, olderThanMs));
}
