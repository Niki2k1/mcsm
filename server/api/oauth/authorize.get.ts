/**
 * Data for the consent screen. Validation errors are shown on the page, never
 * redirected: the redirect_uri isn't trusted until validation passes.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, string | undefined>;
  try {
    const request = await validateAuthorizeRequest(query);
    return {
      client: {
        name: request.client.name,
        clientUri: request.client.clientUri,
        logoUri: request.client.logoUri,
      },
      redirectHost: new URL(request.redirectUri).host,
      scopes: request.scopes,
    };
  } catch (error) {
    if (error instanceof OAuthError) {
      throw createError({ statusCode: 400, statusMessage: error.description });
    }
    throw error;
  }
});
