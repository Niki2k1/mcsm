import * as v from "valibot";

/**
 * Save a single config file. YAML/JSON is validated server-side; with
 * restart=true a running server is restarted so the change takes effect.
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { path, content, restart } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        path: v.string(),
        content: v.string(),
        restart: v.optional(v.boolean(), false),
      })
    )
  );

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
    await writeConfigFile(
      id,
      server.config?.type,
      server.config?.LEVEL,
      path,
      content
    );
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
