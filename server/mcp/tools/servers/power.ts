import { z } from "zod";

const ACTIVITY = {
  start: "started",
  stop: "stopped",
  restart: "restarted",
} as const;

export default defineMcpTool({
  name: "set_server_power",
  description:
    "Start, stop or restart a server. Stopping disconnects every player, so check list_players first and confirm with the user.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:operate"),
  inputSchema: {
    server: z.string().describe("Server id from list_servers"),
    action: z.enum(["start", "stop", "restart"]),
  },
  handler: async ({ server: ref, action }) => {
    const { server, docker } = await requireMcpServer(ref, "servers:operate");
    if (action === "start") await docker.startServer(server.id);
    else if (action === "stop") await docker.stopServer(server.id);
    else await docker.restartServer(server.id);
    await recordActivity(server.volume, ACTIVITY[action], "via MCP");
    return action === "stop"
      ? `Stopped ${server.name}.`
      : `${action === "start" ? "Started" : "Restarted"} ${server.name}. It takes a while until players can join; check get_server_logs for "Done".`;
  },
});
