import { z } from "zod";
import { serverConfigSchema } from "../../../../schema/server.schema";

/**
 * One-click enable for world pre-generation: append Chunky to the server's
 * MODRINTH_PROJECTS and recreate the container (same flow as a config edit —
 * Docker can't change env vars in place). The itzg image downloads Chunky on
 * the next boot.
 *
 * Returns the new container id — the caller must navigate to it.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const config = useRuntimeConfig(event);
  const { getServer, removeServer, provisionServer } = useDocker(event);

  let existing: Awaited<ReturnType<typeof getServer>>;
  try {
    existing = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!existing.config) {
    throw createError({
      statusCode: 409,
      statusMessage: "Server has no stored configuration",
    });
  }
  if (!serverTypeSupportsPregen(existing.config.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Pre-generation is not supported for ${existing.config.type} servers`,
    });
  }
  if (hasChunky(existing.config.MODRINTH_PROJECTS)) {
    // Already enabled — nothing to do.
    return { id: existing.id, alreadyEnabled: true };
  }

  // Re-validate so configs created before newer schema fields pick up defaults.
  const data = serverConfigSchema.parse({
    ...existing.config,
    MODRINTH_PROJECTS: addChunky(existing.config.MODRINTH_PROJECTS),
  });

  const spec = await buildServerSpec(data, event);

  try {
    // Reuse the original container name and volume so the world survives.
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

    await recordActivity(
      volume,
      "edited",
      "Enabled world pre-generation (Chunky) — container recreated"
    );

    return { id: container.id, alreadyEnabled: false };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to enable pre-generation",
    });
  }
});
