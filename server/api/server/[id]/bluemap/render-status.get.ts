import * as v from "valibot";

/**
 * Live BlueMap render status, parsed from the `bluemap` command over RCON:
 * which maps are being rendered, their progress/ETA, and what's still queued.
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );

  const response = await withRcon(event, id, (rcon) => rcon.send("bluemap"));
  return parseBluemapStatus(response);
});
