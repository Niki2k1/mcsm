import * as v from "valibot";

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );

  try {
    const { startServer, getServer } = useDocker(event);
    const server = await getServer(id);
    await startServer(id);
    await recordActivity(server.volume, "started");
    return { ok: true };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to start server",
    });
  }
});
