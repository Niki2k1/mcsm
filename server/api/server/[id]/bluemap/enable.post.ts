import { z } from "zod";
import { serverConfigSchema } from "../../../../schema/server.schema";

/**
 * Enable BlueMap: set BLUEMAP in the config and recreate the container so the
 * itzg image installs it from Modrinth on the next boot.
 *
 * Returns the new container id — the caller must navigate to it.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { getServer } = useDocker(event);

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
  if (!serverTypeSupportsBluemap(existing.config.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: `BlueMap is not supported for ${existing.config.type} servers`,
    });
  }
  if (existing.config.BLUEMAP) {
    return { id: existing.id, alreadyEnabled: true };
  }

  // Re-validate so configs created before newer schema fields pick up defaults.
  const data = serverConfigSchema.parse({ ...existing.config, BLUEMAP: true });

  try {
    const result = await recreateServer(
      event,
      id,
      data,
      "Enabled BlueMap — container recreated"
    );
    return { id: result.id, alreadyEnabled: false };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to enable BlueMap",
    });
  }
});
