import * as v from "valibot";

/** Recent lifecycle events for a server (newest first). */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );

  try {
    const { getServer } = useDocker(event);
    const server = await getServer(id);
    if (!server.volume) return [];

    return await listActivity(server.volume);
  } catch (error) {
    console.error(error);
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
});
