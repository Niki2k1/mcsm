import { z } from "zod";
import { serverConfigSchema } from "../../../../schema/server.schema";

/**
 * Disable BlueMap: clear the config flag and recreate the container. BlueMap's
 * rendered map data stays in the world volume (harmless), so re-enabling later
 * picks up where it left off.
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

  if (!existing.config?.BLUEMAP) {
    return { id: existing.id, alreadyDisabled: true };
  }

  const data = serverConfigSchema.parse({ ...existing.config, BLUEMAP: false });

  try {
    const result = await recreateServer(
      event,
      id,
      data,
      "Disabled BlueMap — container recreated"
    );
    return { id: result.id, alreadyDisabled: false };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to disable BlueMap",
    });
  }
});
