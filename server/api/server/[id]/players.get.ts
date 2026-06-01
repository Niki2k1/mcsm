import { z } from "zod";

/**
 * Player overview for a server:
 * - online: who is connected right now (live, via RCON `list`)
 * - whitelist: the live whitelist (via RCON `whitelist list`), falling back to
 *   the config baseline when the server is offline
 * - ops: the config baseline (Minecraft has no RCON command to list operators,
 *   so live op/deop changes can't be reflected here)
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { getServer } = useDocker(event);

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const ops = server.config?.operators ?? [];
  const baseline = server.config?.whitelist ?? [];

  if (!server.running) {
    return { offline: true, online: [], ops, whitelist: baseline };
  }

  try {
    return await withRcon(event, id, async (rcon) => {
      const online = parsePlayerNames(await rcon.send("list"));
      const liveWhitelist = parsePlayerNames(await rcon.send("whitelist list"));

      // Keep any UUIDs we know from the config baseline for avatar lookups.
      const uuidByName = new Map(
        baseline.map((entry) => [entry.name.toLowerCase(), entry.uuid])
      );

      return {
        offline: false,
        online: online.map((name) => ({ name })),
        ops,
        whitelist: liveWhitelist.map((name) => ({
          name,
          uuid: uuidByName.get(name.toLowerCase()) ?? "",
        })),
      };
    });
  } catch {
    // RCON not ready yet (server still booting) — degrade to config data.
    return { offline: true, online: [], ops, whitelist: baseline };
  }
});
