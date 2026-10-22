import { z } from "zod";

/** Full detail for one server, used to prefill the edit form. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

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
