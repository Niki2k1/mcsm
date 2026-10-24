import { z } from "zod";

const COMMANDS = {
  op: "op",
  deop: "deop",
  "whitelist-add": "whitelist add",
  "whitelist-remove": "whitelist remove",
  kick: "kick",
} as const;

export default defineMcpTool({
  name: "manage_player",
  description:
    "Op/deop, add to or remove from the whitelist, or kick a player on a running server. Changes the live server only, not the saved configuration.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:operate"),
  inputSchema: {
    server: z.string().describe("Server id from list_servers"),
    action: z.enum(["op", "deop", "whitelist-add", "whitelist-remove", "kick"]),
    // Strict username pattern also rules out command injection.
    player: z
      .string()
      .regex(/^[A-Za-z0-9_]{1,16}$/)
      .describe("Minecraft username"),
  },
  handler: async ({ server: ref, action, player }) => {
    const { server, event } = await requireMcpServer(ref, "servers:operate");
    const response = await withRcon(event, server.id, (rcon) =>
      rcon.send(`${COMMANDS[action]} ${player}`)
    );
    return response || "Done.";
  },
});
