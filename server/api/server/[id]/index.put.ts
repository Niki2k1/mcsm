import { z } from "zod";
import { serverConfigSchema } from "../../../schema/server.schema";

/**
 * Editing a server means recreating its container with the new config. Docker
 * can't mutate env/labels in place, so we remove the old container (keeping its
 * volume) and provision a fresh one reusing the same name and volume — the
 * world data is preserved.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const data = await useValidatedBody(event, serverConfigSchema);

  const config = useRuntimeConfig(event);
  const { getServer, removeServer, provisionServer } = useDocker(event);
  const spec = await buildServerSpec(data, event);

  try {
    const existing = await getServer(id);

    // Reuse the original container name and volume so the world survives even
    // if the display name / subdomain changed.
    const name = existing.containerName || spec.name;
    const volume = existing.volume || spec.volume;

    await removeServer(id, { removeVolume: false });

    const container = await provisionServer({
      name,
      image: config.docker?.image || "itzg/minecraft-server",
      env: spec.env,
      labels: spec.labels,
      memoryBytes: spec.memoryBytes,
      port: spec.port,
      volume,
      restartPolicy: spec.restartPolicy,
    });

    await recordActivity(volume, "edited", "Configuration saved — container recreated");

    return { id: container.id, name: container.name, domain: spec.domain };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update server",
    });
  }
});
