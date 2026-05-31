import { z } from "zod";

/** Read a single config file as text. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { path } = await useValidatedQuery(event, { path: z.string() });

  try {
    return await readConfigFile(id, path);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to read file",
    });
  }
});
