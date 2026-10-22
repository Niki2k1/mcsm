import * as v from "valibot";

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );

  try {
    const { restartServer, getServer } = useDocker(event);
    const server = await getServer(id);
    await restartServer(id);
    await recordActivity(server.volume, "restarted");
    return { ok: true };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to restart server",
    });
  }
});
