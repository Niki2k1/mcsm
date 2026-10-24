import { z } from "zod";

export default defineMcpTool({
  name: "run_console_command",
  description:
    "Run a command on a running server's console via RCON (without the leading slash, e.g. `time set day`, `say Hello`, `list`). Commands run with full operator rights — confirm destructive ones with the user first.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:operate"),
  inputSchema: {
    server: z.string().describe("Server id from list_servers"),
    command: z.string().min(1).max(1000),
  },
  handler: async ({ server: ref, command }) => {
    const { server, event } = await requireMcpServer(ref, "servers:operate");
    const response = await withRcon(event, server.id, (rcon) =>
      rcon.send(command.replace(/^\//, ""))
    );
    return response || "(no output)";
  },
});
