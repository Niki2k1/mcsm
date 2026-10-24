import * as v from "valibot";

/**
 * Remove a player from the whitelist. Idempotent: removing someone who isn't
 * on the list succeeds with `result: "not-whitelisted"`.
 */
export default defineEventHandler(async (event) => {
  const id = await readServerIdParam(event);
  const { name } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string(), name: playerNameSchema }))
  );
  await requireApiServer(event, id, "players:whitelist");

  const change = await changeWhitelist(event, id, "remove", name);
  return { result: change.result, appliedVia: change.via };
});
