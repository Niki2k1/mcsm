import { z } from "zod";

/**
 * Delete a single plugin jar. The `name` is constrained to a bare `*.jar`
 * file name (no path separators, no `..`) so it can't escape the plugins
 * directory. A running server is restarted afterwards so the plugin is
 * actually unloaded.
 */

const nameSchema = z
  .string()
  .regex(/^[^/\\]+\.jar$/i, "Invalid plugin name")
  .refine((name) => !name.includes(".."), "Invalid plugin name");

export default defineEventHandler(async (event) => {
  const { id, name } = await useValidatedParams(event, {
    id: z.string(),
    name: nameSchema,
  });

  const { getServer, restartServer } = useDocker();

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  try {
    await deletePlugin(id, name);
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete plugin",
    });
  }

  let restarted = false;
  if (server.running) {
    try {
      await restartServer(id);
      restarted = true;
    } catch (error) {
      console.error(error);
    }
  }

  return { removed: name, restarted };
});
