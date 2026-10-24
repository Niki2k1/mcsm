import * as v from "valibot";

/**
 * Release a claim so its key can claim again. The player stays whitelisted;
 * removing them is a separate, deliberate action.
 */
export default defineEventHandler(async (event) => {
  const { id, claimId } = await getValidatedRouterParams(
    event,
    v.parser(
      v.object({
        id: v.string(),
        claimId: v.pipe(v.string(), v.toNumber(), v.integer()),
      })
    )
  );
  let volume: string | null;
  try {
    volume = (await useDocker(event).getServer(id)).volume;
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
  if (!volume || !(await releaseWhitelistClaim(volume, claimId))) {
    throw createError({ statusCode: 404, statusMessage: "Unknown claim" });
  }
  return { released: true };
});
