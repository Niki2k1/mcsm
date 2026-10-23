import { z } from "zod";

export default defineMcpTool({
  name: "get_server",
  description:
    "Details for one server: status, uptime, CPU/memory usage, and its gameplay configuration (version, memory, difficulty, game mode, player limits, whitelist, mods).",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:read"),
  inputSchema: {
    server: z
      .string()
      .describe("Server id from list_servers (display name also works)"),
  },
  handler: async ({ server: ref }) => {
    const { server, access, docker } = await requireMcpServer(
      ref,
      "servers:read"
    );
    const detail = await docker.getServer(server.id);
    const stats = detail.running
      ? await readContainerStats(docker.docker, server.id).catch(() => null)
      : null;
    const config = detail.config;

    // Hand-picked so secrets in the config (API keys, custom env) never leave
    // the server through an LLM context.
    return {
      id: detail.id,
      name: detail.name,
      address: detail.domain || null,
      access,
      running: detail.running,
      startedAt: detail.startedAt,
      usage: stats
        ? {
            cpuPercent: stats.cpu,
            memoryUsedBytes: stats.memUsed,
            memoryLimitBytes: stats.memLimit,
          }
        : null,
      config: config && {
        type: config.type,
        version: config.VERSION?.label ?? null,
        memory: config.memory,
        motd: config.MOTD,
        difficulty: config.DIFFICULTY,
        gameMode: config.MODE,
        hardcore: config.HARDCORE,
        maxPlayers: config.MAX_PLAYERS,
        onlineMode: config.ONLINE_MODE,
        whitelistEnabled: config.ENABLE_WHITELIST,
        viewDistance: config.VIEW_DISTANCE,
        modpack: config.CF_SLUG ?? config.FTB_MODPACK_ID ?? null,
        modrinthProjects: config.MODRINTH_PROJECTS,
        bluemap: config.BLUEMAP,
        voiceChat: config.VOICE_CHAT,
      },
    };
  },
});
