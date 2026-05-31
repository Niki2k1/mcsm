/**
 * Re-apply current settings to every managed server by recreating its
 * container from its stored config plus the latest global secrets. This is how
 * a changed secret (or other global default) reaches servers that already
 * exist — Docker can't mutate env in place. Each server briefly restarts.
 *
 * Volumes (worlds) are always preserved.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const { listServers, getServer, removeServer, provisionServer } = useDocker(event);
  const image = config.docker?.image || "itzg/minecraft-server";

  const servers = await listServers();

  let applied = 0;
  const failed: Array<{ name: string; error: string }> = [];

  for (const server of servers) {
    if (!server.config) continue; // not wizard-created — skip

    try {
      const existing = await getServer(server.id);
      const spec = await buildServerSpec(server.config, event);

      const name = existing.containerName || spec.name;
      const volume = existing.volume || spec.volume;

      await removeServer(server.id, { removeVolume: false });
      await provisionServer({
        name,
        image,
        env: spec.env,
        labels: spec.labels,
        memoryBytes: spec.memoryBytes,
        port: spec.port,
        volume,
      });

      applied++;
    } catch (error) {
      console.error(`Re-apply failed for ${server.name}`, error);
      failed.push({
        name: server.name || server.id,
        error: (error as Error).message ?? "unknown error",
      });
    }
  }

  return { total: servers.length, applied, failed };
});
