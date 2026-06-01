import { z } from "zod";

/** Recent lifecycle events for a server (newest first). */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  try {
    const { getServer } = useDocker(event);
    const server = await getServer(id);
    if (!server.volume) return [];

    return await listActivity(server.volume);
  } catch (error) {
    console.error(error);
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
});
