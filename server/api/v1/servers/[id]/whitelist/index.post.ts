import * as v from "valibot";

/**
 * Whitelist a player. Idempotent: adding someone who is already on the list
 * succeeds with `result: "already-whitelisted"`.
 */
export default defineEventHandler(async (event) => {
  const id = await readServerIdParam(event);
  const { name } = await readValidatedBody(
    event,
    v.parser(v.object({ name: playerNameSchema }))
  );
  await requireApiServer(event, id, "players:whitelist");

  const change = await changeWhitelist(event, id, "add", name);
  return {
    result: change.result,
    player: change.player && publicPlayer(change.player),
    // "file" = the server is stopped; the change applies on its next start.
    appliedVia: change.via,
  };
});
