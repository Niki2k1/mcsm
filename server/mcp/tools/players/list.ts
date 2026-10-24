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
    // Unresolvable entries (offline-mode players) fall back to their UUID so
    // they stay visible instead of disappearing from the list.
    const names = (list: PlayerListEntry[]) =>
      list.map((entry) => entry.name || entry.uuid);
    const [whitelist, operators] = await Promise.all([
      readPlayerList(server.id, "whitelist").then(names),
      readPlayerList(server.id, "ops").then(names),
    ]);
    if (!server.running) {
      return { running: false, online: [], whitelist, operators };
    }
    try {
      return await withRcon(event, server.id, async (rcon) => ({
        running: true,
        online: parsePlayerNames(await rcon.send("list")),
        whitelist,
        operators,
      }));
    } catch {
      // RCON comes up late in the boot sequence.
      return {
        running: true,
        starting: true,
        online: [],
        whitelist,
        operators,
      };
    }
  },
});
