export default defineMcpTool({
  description:
    "Who this connection acts as: the MCSM user, whether they are an admin, and the scopes granted to this connection.",
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async () => {
    const { user, scopes, kind } = useMcpAuth();
    return {
      name: user.name,
      email: user.email,
      admin: user.admin,
      connection: kind === "oauth" ? "OAuth app" : "personal access token",
      scopes,
    };
  },
});
