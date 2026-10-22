import * as v from "valibot";

/**
 * Save a single text file (also creates new ones). YAML/JSON is validated
 * server-side; with restart=true a running server is restarted so the change
 * takes effect.
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

  const server = await getFileManagerServer(event, id);
  const { restartServer } = useDocker(event);

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
