import { z } from "zod";

export default defineMcpTool({
  name: "manage_player",
  description:
    "Op/deop, add to or remove from the whitelist, or kick a player. Changes the server's whitelist.json / ops.json, which persist across restarts and recreates; on a stopped server the change applies on its next start. Refused while the server is still starting.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:operate"),
  inputSchema: {
    server: z.string().describe("Server id from list_servers"),
    action: z.enum(PLAYER_ACTIONS),
    // Strict username pattern also rules out command injection.
    player: z
      .string()
      .regex(PLAYER_NAME_PATTERN)
      .describe("Minecraft username"),
  },
  handler: async ({ server: ref, action, player }) => {
    const { server, event } = await requireMcpServer(ref, "servers:operate");
    const { via, response } = await runPlayerAction(event, server.id, action, {
      name: player,
    });
    if (via === "file") {
      return "Saved; the server is stopped, so this applies on its next start.";
    }
    return response || "Done.";
  },
});
