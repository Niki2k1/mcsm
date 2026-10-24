/** The servers this token can read: within its restriction and the user's grants. */
export default defineEventHandler(async (event) => {
  const auth = requireBearerAuth(event);
  if (!hasTokenScope(auth.scopes, "servers:read")) {
    throw createError({
      statusCode: 403,
      statusMessage: "This token lacks the servers:read scope",
    });
  }
  const servers = await useDocker(event).listServers();
  const visible = await serversForToken(auth, servers, "servers:read");
  return visible.map(publicServer);
});
