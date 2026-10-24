import * as v from "valibot";

/** One-time whitelist claims made through the public API on this server. */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  let volume: string | null;
  try {
    volume = (await useDocker(event).getServer(id)).volume;
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
  return volume ? listWhitelistClaims(volume) : [];
});
