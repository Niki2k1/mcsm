import * as v from "valibot";

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );

  try {
    const { stopServer, getServer } = useDocker(event);
    const server = await getServer(id);
    await stopServer(id);
    await recordActivity(server.volume, "stopped");
    return { ok: true };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to stop server",
    });
  }
});
