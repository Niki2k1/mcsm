import { z } from "zod";

/**
 * Removes a server's container. The named volume (the world) is kept so it can
 * be recovered — delete it manually if you really want the world gone.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  try {
    const { removeServer } = useDocker();
    await removeServer(id, { removeVolume: false });
    return { ok: true };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete server",
    });
  }
});
