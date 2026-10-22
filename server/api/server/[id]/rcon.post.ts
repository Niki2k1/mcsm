import * as v from "valibot";

/**
 * Runs a single command against a server over RCON (used by the console).
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { command } = await readValidatedBody(
    event,
    v.parser(v.object({ command: v.string() }))
  );

  const response = await withRcon(event, id, (rcon) => rcon.send(command));
  return { response };
});
