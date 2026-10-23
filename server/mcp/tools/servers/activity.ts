import { z } from "zod";

export default defineMcpTool({
  name: "get_server_activity",
  description:
    "Recent lifecycle events of a server (created, started, stopped, edited, backups, pre-generation, ...), newest first. Timestamps are ms since epoch.",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:read"),
  inputSchema: {
    server: z.string().describe("Server id from list_servers"),
    limit: z.number().int().min(1).max(200).default(30),
  },
  handler: async ({ server: ref, limit }) => {
    const { server } = await requireMcpServer(ref, "servers:read");
    if (!server.volume) return [];
    const events = await listActivity(server.volume, limit);
    return events.map(({ t, action, detail }) => ({
      at: new Date(t).toISOString(),
      action,
      detail,
    }));
  },
});
