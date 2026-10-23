export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  setResponseHeader(event, "Pragma", "no-cache");
  try {
    const body = await readOAuthBody(event);
    const client = await authenticateClient(event, body);
    switch (body.grant_type) {
      case "authorization_code":
        return await exchangeAuthorizationCode(client, body);
      case "refresh_token":
        return await refreshAccessToken(client, body);
      default:
        throw new OAuthError(
          "unsupported_grant_type",
          "Unsupported grant_type"
        );
    }
  } catch (error) {
    if (error instanceof OAuthError) return sendOAuthError(event, error);
    throw error;
  }
});
