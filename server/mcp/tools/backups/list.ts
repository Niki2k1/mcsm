import { z } from "zod";

export default defineMcpTool({
  name: "list_backups",
  description: "World backups of a server, newest first.",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:manage"),
  inputSchema: {
    server: z.string().describe("Server id from list_servers"),
  },
  handler: async ({ server: ref }) => {
    const { server } = await requireMcpServer(ref, "servers:manage");
    if (!server.volume) return [];
    const backups = await listBackups(server.volume);
    return backups.map((backup) => ({
      id: backup.id,
      label: backup.label,
      state: backup.state,
      sizeBytes: backup.sizeBytes,
      createdAt: new Date(backup.createdAt).toISOString(),
    }));
  },
});
