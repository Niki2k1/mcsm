import { z } from "zod";

export default defineMcpTool({
  name: "list_players",
  description:
    "Who is online on a server right now, plus its whitelist and operators (read from the server's own whitelist.json / ops.json, so also current while it's stopped).",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:read"),
  inputSchema: {
    server: z.string().describe("Server id from list_servers"),
  },
  handler: async ({ server: ref }) => {
    const { server, event } = await requireMcpServer(ref, "servers:read");
    const players = await getPlayerOverview(event, server.id);
    // Unresolvable entries (offline-mode players) fall back to their UUID so
    // they stay visible instead of disappearing from the list.
    const names = (list: PlayerListEntry[]) =>
      list.map((entry) => entry.name || entry.uuid);
    return {
      running: players.running,
      // RCON comes up late in the boot sequence; changes wait until then.
      starting: players.running && players.offline,
      online: players.online.map((player) => player.name),
      whitelist: names(players.whitelist),
      operators: names(players.ops),
      whitelistEnabled: players.settings.enabled,
    };
  },
});
