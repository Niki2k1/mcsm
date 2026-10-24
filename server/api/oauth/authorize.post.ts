import * as v from "valibot";

/**
 * Records the consent decision and returns where to send the browser. The SPA
 * performs the redirect itself, so custom-scheme redirect URIs work too.
 */
export default defineEventHandler(async (event) => {
  const user = await currentUser(event);
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }

  const body = await readValidatedBody(
    event,
    v.parser(
      v.object({
        decision: v.picklist(["approve", "deny"]),
        params: v.record(v.string(), v.optional(v.string())),
      })
    )
  );

  let request: AuthorizeRequest;
  try {
    request = await validateAuthorizeRequest(body.params);
  } catch (error) {
    if (error instanceof OAuthError) {
      throw createError({ statusCode: 400, statusMessage: error.description });
    }
    throw error;
  }

  if (body.decision === "deny") {
    return {
      redirectTo: buildRedirect(request.redirectUri, {
        error: "access_denied",
        error_description: "The user denied the request",
        state: request.state,
      }),
    };
  }

  const code = await issueAuthorizationCode(request, user.id);
  return {
    redirectTo: buildRedirect(request.redirectUri, {
      code,
      state: request.state,
    }),
  };
});
