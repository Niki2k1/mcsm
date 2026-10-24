export default defineMcpTool({
  description:
    "Who this connection acts as: the MCSM user, whether they are an admin, the scopes granted to this connection and, for personal access tokens, the servers it is limited to.",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async () => {
    const { user, scopes, kind, servers } = useMcpAuth();
    return {
      name: user.name,
      email: user.email,
      admin: user.admin,
      connection: kind === "oauth" ? "OAuth app" : "personal access token",
      scopes,
      // World volumes; null means every server the user can access.
      limitedToServers: servers,
    };
  },
});
