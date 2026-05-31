import { z } from "zod";

/**
 * Save a single config file. YAML/JSON is validated server-side; the change
 * takes effect after the server is restarted (a separate action on the page).
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { path, content } = await useValidatedBody(event, {
    path: z.string(),
    content: z.string(),
  });

  try {
    await writeConfigFile(id, path, content);
    return { ok: true };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to save file",
    });
  }
});
