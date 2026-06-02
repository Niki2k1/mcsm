import { z } from "zod";

/**
 * Save a single config file. YAML/JSON is validated server-side; with
 * restart=true a running server is restarted so the change takes effect.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { path, content, restart } = await useValidatedBody(event, {
    path: z.string(),
    content: z.string(),
    restart: z.boolean().default(false),
  });

  const { getServer, restartServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!serverTypeSupportsJars(server.config?.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: "This server type does not support config editing",
    });
  }

  try {
    await writeConfigFile(id, server.config?.type, path, content);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to save file",
    });
  }

  await recordActivity(server.volume, "config-edited", path);

  let restarted = false;
  if (restart && server.running) {
    try {
      await restartServer(id);
      restarted = true;
    } catch (error) {
      console.error(error);
    }
  }

  return { ok: true, restarted };
});
