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

  try {
    const result = await recreateServer(
      event,
      id,
      data,
      "Configuration saved — container recreated"
    );
    return { id: result.id, name: result.name, domain: result.domain };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update server",
    });
  }
});
