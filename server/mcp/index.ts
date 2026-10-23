/**
 * Default MCP handler. Unauthenticated requests get a 401 pointing at the
 * RFC 9728 metadata, which makes OAuth-capable hosts (Claude, Cursor, ...)
 * run the authorization flow against MCSM itself. Personal access tokens work
 * as plain bearer tokens for clients that can't do OAuth.
 */
export default defineMcpHandler({
  middleware: async (event) => {
    const auth = await authenticateBearer(event);
    if (!auth) {
      const issuer = getOAuthIssuer(event);
      const hadToken = Boolean(getHeader(event, "authorization"));
      const challenge =
        `Bearer realm="mcsm", resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp"` +
        (hadToken ? ', error="invalid_token"' : "");
      return new Response(
        JSON.stringify({
          error: hadToken ? "invalid_token" : "unauthorized",
          error_description:
            "Sign in with OAuth or use a personal access token from MCSM.",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": challenge,
            "Cache-Control": "no-store",
          },
        }
      );
    }
    event.context.mcpAuth = auth;
  },
});
