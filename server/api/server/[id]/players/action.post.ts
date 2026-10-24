import * as v from "valibot";

/** Op/deop, whitelist and kick a player (see runPlayerAction). */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { action, name, uuid } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        action: v.picklist(PLAYER_ACTIONS),
        name: v.optional(v.pipe(v.string(), v.regex(PLAYER_NAME_PATTERN))),
        // Lets removals target entries without a name.
        uuid: v.optional(v.pipe(v.string(), v.regex(PLAYER_UUID_PATTERN))),
      })
    )
  );

  const { response } = await runPlayerAction(event, id, action, {
    name,
    uuid,
  });
  return { response };
});
