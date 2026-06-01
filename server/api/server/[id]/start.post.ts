import { z } from "zod";

export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  try {
    const { startServer, getServer } = useDocker(event);
    const server = await getServer(id);
    await startServer(id);
    await recordActivity(server.volume, "started");
    return { ok: true };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to start server",
    });
  }
});
