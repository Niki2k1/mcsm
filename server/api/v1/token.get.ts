/**
 * The calling token itself — lets clients check their configuration at
 * startup without touching a server.
 */
export default defineEventHandler((event) => {
  const { kind, scopes, servers, user } = requireBearerAuth(event);
  return {
    kind: kind === "oauth" ? "oauth" : "personal",
    user: user.name,
    scopes,
    // World volumes; null means every server the user can access.
    servers,
  };
});
