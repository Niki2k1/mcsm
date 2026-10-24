import * as v from "valibot";

/**
 * Player overview for a server: who is online, whitelist, operators and the
 * whitelist switches (see getPlayerOverview).
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  return getPlayerOverview(event, id);
});
