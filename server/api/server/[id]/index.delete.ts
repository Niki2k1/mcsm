import { z } from "zod";

/**
 * Removes a server's container. By default the named volume (the world) is
 * kept so it can be recovered; pass `?removeVolume=true` to delete it too
 * (used by the danger zone on the server settings tab).
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { removeVolume } = await useValidatedQuery(event, {
    removeVolume: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  });

  try {
    const { removeServer, getServer } = useDocker(event);
    const server = await getServer(id);
    await removeServer(id, { removeVolume });
    await recordActivity(
      server.volume,
      "deleted",
      removeVolume ? "Server and world volume deleted" : "World volume kept"
    );
    return { ok: true };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete server",
    });
  }
});
