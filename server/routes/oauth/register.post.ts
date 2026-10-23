import * as v from "valibot";

/**
 * RFC 7591 dynamic client registration. Open by design: MCP hosts register
 * themselves on first connect. Registering grants nothing — a signed-in user
 * still has to approve the consent screen.
 */
const metadataSchema = v.object({
  client_name: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120))
  ),
  redirect_uris: v.pipe(
    v.array(v.pipe(v.string(), v.url())),
    v.minLength(1),
    v.maxLength(20)
  ),
  token_endpoint_auth_method: v.optional(
    v.picklist(TOKEN_ENDPOINT_AUTH_METHODS)
  ),
  grant_types: v.optional(v.array(v.string())),
  response_types: v.optional(v.array(v.string())),
  client_uri: v.optional(v.pipe(v.string(), v.url())),
  logo_uri: v.optional(v.pipe(v.string(), v.url())),
  scope: v.optional(v.string()),
});

const SUPPORTED_GRANTS = ["authorization_code", "refresh_token"];

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  try {
    const parsed = v.safeParse(metadataSchema, await readBody(event));
    if (!parsed.success) {
      throw new OAuthError(
        "invalid_client_metadata",
        parsed.issues[0]?.message ?? "Invalid client metadata"
      );
    }
    const meta = parsed.output;

    if (
      (meta.grant_types ?? SUPPORTED_GRANTS).some(
        (g) => !SUPPORTED_GRANTS.includes(g)
      )
    ) {
      throw new OAuthError(
        "invalid_client_metadata",
        "Only authorization_code and refresh_token grants are supported"
      );
    }
    if ((meta.response_types ?? ["code"]).some((r) => r !== "code")) {
      throw new OAuthError(
        "invalid_client_metadata",
        "Only response_type=code is supported"
      );
    }
    const scopes = parseScopes(meta.scope);
    if (scopes.some((scope) => !isMcpScope(scope))) {
      throw new OAuthError("invalid_client_metadata", "Unknown scope");
    }

    // RFC 7591 defaults to client_secret_basic, but MCP hosts are public
    // clients that rely on PKCE alone.
    const { client, secret } = await createOAuthClient({
      name: meta.client_name ?? new URL(meta.redirect_uris[0]!).hostname,
      redirectUris: meta.redirect_uris,
      tokenEndpointAuthMethod: meta.token_endpoint_auth_method ?? "none",
      clientUri: meta.client_uri,
      logoUri: meta.logo_uri,
    });

    setResponseStatus(event, 201);
    return {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt / 1000),
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      grant_types: SUPPORTED_GRANTS,
      response_types: ["code"],
      scope: (scopes.length ? scopes : MCP_SCOPES).join(" "),
      ...(client.clientUri ? { client_uri: client.clientUri } : {}),
      ...(client.logoUri ? { logo_uri: client.logoUri } : {}),
    };
  } catch (error) {
    if (error instanceof OAuthError) return sendOAuthError(event, error);
    throw error;
  }
});
