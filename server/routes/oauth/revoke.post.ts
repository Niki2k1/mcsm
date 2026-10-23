/** RFC 7009. Unknown tokens still get a 200 so callers can't probe. */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  try {
    const body = await readOAuthBody(event);
    const client = await authenticateClient(event, body);
    if (!body.token) throw new OAuthError("invalid_request", "Missing token");
    await revokeToken(client, body.token);
    return {};
  } catch (error) {
    if (error instanceof OAuthError) return sendOAuthError(event, error);
    throw error;
  }
});
