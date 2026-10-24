import * as v from "valibot";

/**
 * Player overview for a server:
 * - online: who is connected right now (live, via RCON `list`)
 * - whitelist / ops: the server's own whitelist.json and ops.json, read from
 *   the volume — current whether the server is running or not
 * - settings: whitelist on/off and enforcement, from server.properties
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

  const [whitelist, ops, settings] = await Promise.all([
    readPlayerList(id, "whitelist"),
    readPlayerList(id, "ops"),
    readWhitelistSettings(id),
  ]);

  if (!server.running) {
    return {
      running: false,
      offline: true,
      online: [],
      ops,
      whitelist,
      settings,
    };
  }

  try {
    const online = await withRcon(event, id, async (rcon) =>
      parsePlayerNames(await rcon.send("list"))
    );
    return {
      running: true,
      offline: false,
      online: online.map((name) => ({ name })),
      ops,
      whitelist,
      settings,
    };
  } catch {
    // RCON not ready yet (server still booting) — the lists are still valid.
    return {
      running: true,
      offline: true,
      online: [],
      ops,
      whitelist,
      settings,
    };
  }
});
