import { z } from "zod";

/** List the config files under a server's `/data/plugins` directory. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  try {
    return await listConfigFiles(id);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to list files",
    });
  }
});
