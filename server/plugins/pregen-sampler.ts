/**
 * Background pre-generation progress sampler.
 *
 * Pre-generation runs for hours; the live SSE stream only updates the task
 * while its tab is open. This plugin keeps the stored task current when nobody
 * is watching: every 30 seconds it polls `chunky progress` over RCON for
 * servers with an active (running/paused) task and persists the reading — so
 * progress survives closed tabs and completion is recorded as an activity
 * event no matter what.
 *
 * Same fault model as the stats sampler: failures are isolated per server and
 * never crash the process.
 */

const SAMPLE_INTERVAL_MS = 30_000;
const STARTUP_DELAY_MS = 15_000;

export default defineNitroPlugin(() => {
  let sweeping = false;

  async function sampleAll() {
    // Skip if the previous sweep is still running (slow RCON/Docker).
    if (sweeping) return;
    sweeping = true;

    try {
      const { listServers, getServer } = useDocker();
      const servers = await listServers();
      const running = servers.filter((server) => server.running);

      const results = await Promise.allSettled(
        running.map(async (server) => {
          // Only servers that can even have a Chunky task.
          if (!hasChunky(server.config?.MODRINTH_PROJECTS)) return;

          const detail = await getServer(server.id);
          if (!detail.volume) return;

          // Only poll RCON while a task is active — no point hammering idle
          // servers every sweep.
          const task = await getPregenTask(detail.volume);
          if (!task || (task.state !== "running" && task.state !== "paused")) {
            return;
          }

          const progress = await withRcon(undefined, server.id, chunkyProgress);
          await applyChunkyProgress(detail.volume, progress);
        })
      );

      // Per-server failures must be visible, not silently swallowed.
      for (const result of results) {
        if (result.status === "rejected") {
          console.error(
            "[mcsm] Failed to sample pre-generation progress:",
            result.reason
          );
        }
      }
    } catch (error) {
      console.error("[mcsm] Pre-generation sampling sweep failed:", error);
    } finally {
      sweeping = false;
    }
  }

  // unref() so the timers never keep the process alive on shutdown.
  setInterval(sampleAll, SAMPLE_INTERVAL_MS).unref?.();
  setTimeout(sampleAll, STARTUP_DELAY_MS).unref?.();

  console.info(
    `[mcsm] Pre-generation sampler started (every ${SAMPLE_INTERVAL_MS / 1000}s)`
  );
});
