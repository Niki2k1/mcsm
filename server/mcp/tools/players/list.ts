import { z } from "zod";

export default defineMcpTool({
  name: "list_players",
  description:
    "Who is online on a server right now, plus its whitelist and operators. Offline servers return the configured whitelist and operators only.",
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
    const operators = (server.config?.operators ?? []).map((op) => op.name);
    const whitelist = (server.config?.whitelist ?? []).map(
      (entry) => entry.name
    );
    if (!server.running) {
      return { running: false, online: [], whitelist, operators };
    }
    try {
      return await withRcon(event, server.id, async (rcon) => ({
        running: true,
        online: parsePlayerNames(await rcon.send("list")),
        whitelist: parsePlayerNames(await rcon.send("whitelist list")),
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
