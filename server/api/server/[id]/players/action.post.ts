import * as v from "valibot";

/**
 * Player management without recreating the container. A running server gets
 * the command over RCON and rewrites its ops.json / whitelist.json itself; a
 * stopped one has the file edited directly, so it applies on the next start.
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { action, name, uuid } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        action: v.picklist([
          "op",
          "deop",
          "whitelist-add",
          "whitelist-remove",
          "kick",
        ]),
        // Strict Minecraft username pattern — also prevents command injection.
        name: v.optional(v.pipe(v.string(), v.regex(/^[A-Za-z0-9_]{1,16}$/))),
        // Lets removals target entries without a name (offline-mode players
        // Mojang can't resolve, or lists seeded from bare UUIDs).
        uuid: v.optional(v.pipe(v.string(), v.regex(/^[0-9a-fA-F-]{32,36}$/))),
      })
    )
  );

  const removal = action === "deop" || action === "whitelist-remove";
  if (!name && !(removal && uuid)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Player name required",
    });
  }

  const { getServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!server.running && action !== "kick") {
    const kind = action.startsWith("whitelist") ? "whitelist" : "ops";
    const op = action === "op" || action === "whitelist-add" ? "add" : "remove";
    // Removal matches by name or UUID, so it needs no lookup (and works for
    // players whose Mojang account no longer resolves).
    const player =
      op === "add"
        ? await resolvePlayer(name!, server.config?.ONLINE_MODE ?? true)
        : { name: name ?? "", uuid: uuid ?? "" };
    await editPlayerListFile(id, kind, op, player);
    return { response: "" };
  }

  if (!name) {
    // RCON commands need a name. The whitelist can be reloaded from its file,
    // ops can't — those have to wait for a stopped server.
    if (action !== "whitelist-remove") {
      throw createError({
        statusCode: 409,
        statusMessage: "Stop the server to remove this operator",
      });
    }
    await editPlayerListFile(id, "whitelist", "remove", {
      name: "",
      uuid: uuid!,
    });
    const response = await withRcon(event, id, (rcon) =>
      rcon.send("whitelist reload")
    );
    return { response };
  }

  const commands: Record<typeof action, string> = {
    op: `op ${name}`,
    deop: `deop ${name}`,
    "whitelist-add": `whitelist add ${name}`,
    "whitelist-remove": `whitelist remove ${name}`,
    kick: `kick ${name}`,
  };

  const response = await withRcon(event, id, (rcon) =>
    rcon.send(commands[action])
  );
  return { response };
});
