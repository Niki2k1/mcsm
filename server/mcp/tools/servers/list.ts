export default defineMcpTool({
  name: "list_servers",
  description:
    "List the Minecraft servers this user can see, with their id (use it in other tools), type, version, address, running state and the user's role on each.",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  enabled: (event) => hasMcpScope(event, "servers:read"),
  handler: async () => {
    const servers = await useDocker(useEvent()).listServers();
    const visible = await serversForToken(
      useMcpAuth(),
      servers,
      "servers:read"
    );
    return visible.map((server) => ({
      id: server.id,
      name: server.name,
      type: server.type,
      version: server.config?.VERSION?.label ?? null,
      address: server.domain || null,
      running: server.running,
      access: server.access,
    }));
  },
});
