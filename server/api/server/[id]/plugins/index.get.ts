import { z } from "zod";

/** List the Paper plugins (`.jar` files) installed on a server. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  try {
    return await listPlugins(id);
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to list plugins",
    });
  }
});
