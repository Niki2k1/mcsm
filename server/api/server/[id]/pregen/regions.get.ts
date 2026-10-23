import * as v from "valibot";

/**
 * Overworld regions that exist on disk, so the pre-generation map can show
 * real progress on first load instead of only what a tab observed live.
 */
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

  if (!server.volume) return { regions: [] };
  return { regions: await listGeneratedRegions(id, server.config?.LEVEL) };
});
