import * as v from "valibot";

/** Full detail for one server, used to prefill the edit form. */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );

  try {
    const { getServer } = useDocker(event);
    // The auth middleware already resolved the caller's level for this server.
    return {
      ...(await getServer(id)),
      access: event.context.serverAccess ?? "admin",
    };
  } catch (error) {
    console.error(error);
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
});
