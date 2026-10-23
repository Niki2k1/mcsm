import { z } from "zod";

export default defineMcpTool({
  name: "create_backup",
  description:
    "Back up a server's world. Safe while the server is running (saving is paused during the snapshot). Large worlds can take a few minutes.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:manage"),
  inputSchema: {
    server: z.string().describe("Server id from list_servers"),
    label: z
      .string()
      .max(100)
      .optional()
      .describe("Short note, e.g. 'before 1.21 update'"),
  },
  handler: async ({ server: ref, label }) => {
    const { server, event } = await requireMcpServer(ref, "servers:manage");
    return createBackup(event, server.id, label);
  },
});
