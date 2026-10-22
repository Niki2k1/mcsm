import * as v from "valibot";

/** List the mod/plugin jars installed on a server. */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );

  const { getServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const dir = jarsDir(server.config?.type);
  if (!dir) {
    throw createError({
      statusCode: 400,
      statusMessage: "This server type does not support mods or plugins",
    });
  }

  try {
    return await listJars(id, dir);
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to list jars",
    });
  }
});
