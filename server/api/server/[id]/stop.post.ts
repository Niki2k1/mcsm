import { z } from "zod";

export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  try {
    const { stopServer, getServer } = useDocker(event);
    const server = await getServer(id);
    await stopServer(id);
    await recordActivity(server.volume, "stopped");
    return { ok: true };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to stop server",
    });
  }
});
