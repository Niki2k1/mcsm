import * as v from "valibot";

/**
 * Turn the whitelist or its enforcement on or off. Whitelist on/off has an
 * RCON command, so a running server changes it live (and writes it to
 * server.properties itself). Enforcement has none: on a running server it
 * means stop → edit server.properties → start, which the UI confirms first.
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { setting, value } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        setting: v.picklist(["enabled", "enforce"]),
        value: v.boolean(),
      })
    )
  );

  const { getServer, stopServer, startServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!server.running) {
    await writeWhitelistSetting(id, setting, value);
    return { restarted: false };
  }

  if (setting === "enabled") {
    await withRcon(event, id, (rcon) =>
      rcon.send(`whitelist ${value ? "on" : "off"}`)
    );
    return { restarted: false };
  }

  await stopServer(id);
  try {
    await writeWhitelistSetting(id, setting, value);
  } finally {
    // Bring the server back even if the edit failed — never leave it down.
    await startServer(id);
  }
  await recordActivity(
    server.volume ?? id,
    "restarted",
    `Whitelist enforcement ${value ? "enabled" : "disabled"}`
  );
  return { restarted: true };
});
