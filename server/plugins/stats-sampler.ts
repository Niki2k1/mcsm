/**
 * Background metrics sampler.
 *
 * Every minute, for each running managed server: read one-shot Docker stats
 * (CPU/memory/network) and ping the Minecraft server (players/latency), then
 * store the sample keyed by world volume. The Analytics tab charts this data.
 *
 * Failures are isolated per server and never crash the process — a server
 * that's mid-restart or unreachable simply contributes no sample this minute.
 */

const SAMPLE_INTERVAL_MS = 60_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // keep one week of samples
const STARTUP_DELAY_MS = 10_000;

export default defineNitroPlugin(() => {
  let sweeping = false;

  async function sampleAll() {
    // Skip if the previous sweep is still running (slow Docker daemon).
    if (sweeping) return;
    sweeping = true;

    try {
      const { listServers, getServer, docker } = useDocker();
      const servers = await listServers();
      const running = servers.filter((server) => server.running);

      const results = await Promise.allSettled(
        running.map(async (server) => {
          const detail = await getServer(server.id);
          if (!detail.volume) return;

          const containerStats = await readContainerStats(docker, server.id);

          // Ping by container name — resolvable on the shared Docker network
          // in production. Unreachable (e.g. local dev) → null player data.
          // The race guards against the pinger's promise never settling on
          // certain DNS/socket failures.
          let players: number | null = null;
          let maxPlayers: number | null = null;
          let latency: number | null = null;
          try {
            const pingPromise = useMinecraftServer({
              host: detail.containerName,
              timeout: 5_000,
            });
            // Swallow late rejections of a raced-out promise.
            pingPromise.catch(() => {});

            const ping = await Promise.race([
              pingPromise,
              new Promise<never>((_, reject) => {
                setTimeout(
                  () => reject(new Error("Ping timed out")),
                  6_000
                ).unref?.();
              }),
            ]);
            const status = ping?.status as
              | { players?: { online?: number; max?: number } }
              | undefined;
            players = status?.players?.online ?? null;
            maxPlayers = status?.players?.max ?? null;
            latency = (ping as { latency?: number })?.latency ?? null;
          } catch {
            // Server still booting or ping not possible from here.
          }

          await insertSample({
            volume: detail.volume,
            t: Date.now(),
            ...containerStats,
            players,
            maxPlayers,
            latency,
          });
        })
      );

      // Per-server failures must be visible, not silently swallowed.
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("[mcsm] Failed to sample a server:", result.reason);
        }
      }

      await pruneStatsSamples(Date.now() - RETENTION_MS);
    } catch (error) {
      console.error("[mcsm] Stats sampling sweep failed:", error);
    } finally {
      sweeping = false;
    }
  }

  // unref() so the timers never keep the process alive on shutdown.
  setInterval(sampleAll, SAMPLE_INTERVAL_MS).unref?.();
  setTimeout(sampleAll, STARTUP_DELAY_MS).unref?.();

  console.info(
    `[mcsm] Stats sampler started (every ${SAMPLE_INTERVAL_MS / 1000}s, ` +
      `keeping ${RETENTION_MS / 86_400_000} days of samples)`
  );
});
