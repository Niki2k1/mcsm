import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { H3Event } from "h3";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@nuxthub/db";
import {
  oauthAuthorizationCodes,
  oauthClients,
  oauthGrants,
  oauthTokens,
  users,
} from "../db/schema";
import { TOKEN_SCOPES, isTokenScope } from "#shared/utils/tokenScopes";

/**
 * OAuth 2.1 authorization server for the MCP endpoint. MCSM is its own
 * identity provider: MCP hosts register dynamically, the signed-in user
 * consents, and the host then acts on that user's behalf with whatever the
 * user's server roles allow.
 *
 * Tokens are opaque random strings; only their sha256 is stored. Access tokens
 * carry their own prefix so the MCP middleware can tell them apart from
 * personal access tokens without a lookup.
 */

export const ACCESS_TOKEN_PREFIX = "mcsm_at_";
const REFRESH_TOKEN_PREFIX = "mcsm_rt_";
const CODE_PREFIX = "mcsm_ac_";
const CLIENT_SECRET_PREFIX = "mcsm_cs_";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const CODE_TTL_SECONDS = 10 * 60;

export const TOKEN_ENDPOINT_AUTH_METHODS = [
  "none",
  "client_secret_basic",
  "client_secret_post",
] as const;
export type TokenEndpointAuthMethod =
  (typeof TOKEN_ENDPOINT_AUTH_METHODS)[number];

export type OAuthClient = typeof oauthClients.$inferSelect;
type OAuthGrant = typeof oauthGrants.$inferSelect;

export class OAuthError extends Error {
  constructor(
    public code: string,
    public description: string,
    public status = 400
  ) {
    super(description);
  }
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(prefix: string): string {
  return prefix + randomBytes(32).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Public origin of this deployment. Behind a reverse proxy the request URL is
 * the internal one, so honor forwarded headers, and let an explicit
 * NUXT_APP_URL win because MCP clients compare the issuer byte for byte.
 */
export function getOAuthIssuer(event: H3Event): string {
  const configured = useRuntimeConfig(event).appUrl;
  if (configured) return configured.replace(/\/+$/, "");
  return getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
    .origin;
}

export function oauthEndpoints(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    resource: `${issuer}/mcp`,
  };
}

// --- Redirect URIs -----------------------------------------------------------

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * https everywhere, plain http only on loopback (RFC 8252), custom schemes for
 * native apps. Fragments are forbidden by RFC 6749 §3.1.2.
 */
export function isAcceptableRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return LOOPBACK_HOSTS.includes(url.hostname);
  return (
    /^[a-z][a-z0-9+.-]*:$/i.test(url.protocol) &&
    !["javascript:", "data:", "file:"].includes(url.protocol)
  );
}

function redirectUriMatches(registered: string, requested: string): boolean {
  if (registered === requested) return true;
  // CLI clients listen on an ephemeral loopback port picked at runtime
  // (RFC 8252 §7.3), so only host and path have to match.
  try {
    const a = new URL(registered);
    const b = new URL(requested);
    return (
      a.protocol === "http:" &&
      b.protocol === "http:" &&
      LOOPBACK_HOSTS.includes(a.hostname) &&
      a.hostname === b.hostname &&
      a.pathname === b.pathname
    );
  } catch {
    return false;
  }
}

// --- Clients -----------------------------------------------------------------

export async function findOAuthClient(clientId: string) {
  const [client] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.id, clientId))
    .limit(1);
  return client ?? null;
}

export function parseScopes(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/\s+/).filter(Boolean))];
}

function validateScopes(scopes: string[]): string[] {
  for (const scope of scopes) {
    if (!isTokenScope(scope)) {
      throw new OAuthError("invalid_scope", `Unknown scope: ${scope}`);
    }
  }
  return scopes;
}

export async function createOAuthClient(input: {
  name: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  clientUri?: string | null;
  logoUri?: string | null;
}): Promise<{ client: OAuthClient; secret: string | null }> {
  for (const uri of input.redirectUris) {
    if (!isAcceptableRedirectUri(uri)) {
      throw new OAuthError(
        "invalid_redirect_uri",
        `Unacceptable redirect_uri: ${uri}`
      );
    }
  }
  const secret =
    input.tokenEndpointAuthMethod === "none"
      ? null
      : randomToken(CLIENT_SECRET_PREFIX);
  const [client] = await db
    .insert(oauthClients)
    .values({
      id: randomBytes(16).toString("hex"),
      name: input.name,
      secretHash: secret ? hashToken(secret) : null,
      redirectUris: input.redirectUris,
      tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
      clientUri: input.clientUri ?? null,
      logoUri: input.logoUri ?? null,
      createdAt: Date.now(),
    })
    .returning();
  return { client: client!, secret };
}

/**
 * Resolve and authenticate the client of a token/revocation request. Public
 * clients only prove possession of `client_id` (PKCE does the rest);
 * confidential ones must present their secret.
 */
export async function authenticateClient(
  event: H3Event,
  body: Record<string, string | undefined>
): Promise<OAuthClient> {
  let clientId = body.client_id;
  let clientSecret = body.client_secret;
  let viaBasic = false;

  const header = getHeader(event, "authorization");
  if (header?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator > 0) {
      clientId = decodeURIComponent(decoded.slice(0, separator));
      clientSecret = decodeURIComponent(decoded.slice(separator + 1));
      viaBasic = true;
    }
  }

  if (!clientId)
    throw new OAuthError("invalid_client", "Missing client_id", 401);
  const client = await findOAuthClient(clientId);
  if (!client) throw new OAuthError("invalid_client", "Unknown client", 401);

  if (client.tokenEndpointAuthMethod === "none") return client;

  if (client.tokenEndpointAuthMethod === "client_secret_basic" && !viaBasic) {
    throw new OAuthError(
      "invalid_client",
      "Client must authenticate with HTTP Basic",
      401
    );
  }
  if (
    !clientSecret ||
    !client.secretHash ||
    !safeEqual(hashToken(clientSecret), client.secretHash)
  ) {
    throw new OAuthError("invalid_client", "Invalid client credentials", 401);
  }
  return client;
}

// --- Authorization request + code --------------------------------------------

export type AuthorizeRequest = {
  client: OAuthClient;
  redirectUri: string;
  scopes: string[];
  state?: string;
  codeChallenge: string;
};

/**
 * Errors raised here must be shown to the user, never redirected: until the
 * redirect_uri is verified it may point at an attacker.
 */
export async function validateAuthorizeRequest(
  query: Record<string, string | undefined>
): Promise<AuthorizeRequest> {
  if (!query.client_id) {
    throw new OAuthError("invalid_request", "Missing client_id");
  }
  const client = await findOAuthClient(query.client_id);
  if (!client) throw new OAuthError("invalid_client", "Unknown client");

  const redirectUri = query.redirect_uri;
  if (!redirectUri) {
    throw new OAuthError("invalid_request", "Missing redirect_uri");
  }
  if (!client.redirectUris.some((r) => redirectUriMatches(r, redirectUri))) {
    throw new OAuthError(
      "invalid_request",
      "redirect_uri is not registered for this client"
    );
  }
  if (query.response_type !== "code") {
    throw new OAuthError(
      "unsupported_response_type",
      "Only response_type=code is supported"
    );
  }
  if (!query.code_challenge) {
    throw new OAuthError("invalid_request", "PKCE code_challenge is required");
  }
  if ((query.code_challenge_method ?? "S256") !== "S256") {
    throw new OAuthError(
      "invalid_request",
      "Only code_challenge_method=S256 is supported"
    );
  }

  // Most MCP hosts don't request scopes at all; the consent screen shows the
  // user exactly what they hand out either way.
  const requested = validateScopes(parseScopes(query.scope));
  const scopes = requested.length ? requested : [...TOKEN_SCOPES];

  return {
    client,
    redirectUri,
    scopes,
    state: query.state,
    codeChallenge: query.code_challenge,
  };
}

export async function issueAuthorizationCode(
  req: AuthorizeRequest,
  userId: number
): Promise<string> {
  const code = randomToken(CODE_PREFIX);
  await db.insert(oauthAuthorizationCodes).values({
    codeHash: hashToken(code),
    clientId: req.client.id,
    userId,
    redirectUri: req.redirectUri,
    scopes: req.scopes,
    codeChallenge: req.codeChallenge,
    expiresAt: Date.now() + CODE_TTL_SECONDS * 1000,
  });
  return code;
}

export function buildRedirect(
  redirectUri: string,
  params: Record<string, string | undefined>
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

// --- Token issuance ----------------------------------------------------------

type IssuedTokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

async function upsertGrant(
  clientId: string,
  userId: number,
  scopes: string[]
): Promise<OAuthGrant> {
  const now = Date.now();
  const [existing] = await db
    .select()
    .from(oauthGrants)
    .where(
      and(eq(oauthGrants.clientId, clientId), eq(oauthGrants.userId, userId))
    )
    .limit(1);

  if (existing) {
    // The user just approved again, so a revoked grant comes back to life with
    // only the newly approved scopes.
    const merged = [
      ...new Set([...(existing.revokedAt ? [] : existing.scopes), ...scopes]),
    ];
    const [updated] = await db
      .update(oauthGrants)
      .set({ scopes: merged, revokedAt: null, lastUsedAt: now })
      .where(eq(oauthGrants.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(oauthGrants)
    .values({ clientId, userId, scopes, createdAt: now, lastUsedAt: now })
    .returning();
  return created!;
}

async function mintTokenPair(
  grantId: number,
  scopes: string[]
): Promise<IssuedTokens> {
  const accessToken = randomToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = randomToken(REFRESH_TOKEN_PREFIX);
  const now = Date.now();
  await db.insert(oauthTokens).values([
    {
      tokenHash: hashToken(accessToken),
      kind: "access",
      grantId,
      scopes,
      expiresAt: now + ACCESS_TOKEN_TTL_SECONDS * 1000,
    },
    {
      tokenHash: hashToken(refreshToken),
      kind: "refresh",
      grantId,
      scopes,
      expiresAt: now + REFRESH_TOKEN_TTL_SECONDS * 1000,
    },
  ]);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: scopes.join(" "),
  };
}

export async function exchangeAuthorizationCode(
  client: OAuthClient,
  body: Record<string, string | undefined>
): Promise<IssuedTokens> {
  const { code, redirect_uri: redirectUri, code_verifier: verifier } = body;
  if (!code) throw new OAuthError("invalid_request", "Missing code");
  if (!verifier)
    throw new OAuthError("invalid_request", "Missing code_verifier");

  const codeHash = hashToken(code);
  // Deleting before validating makes a code single-use even under a replay
  // that races the legitimate exchange.
  const [row] = await db
    .delete(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.codeHash, codeHash))
    .returning();

  if (!row || row.clientId !== client.id) {
    throw new OAuthError("invalid_grant", "Invalid authorization code");
  }
  if (row.expiresAt < Date.now()) {
    throw new OAuthError("invalid_grant", "Authorization code expired");
  }
  if (redirectUri && redirectUri !== row.redirectUri) {
    throw new OAuthError("invalid_grant", "redirect_uri mismatch");
  }
  const expected = createHash("sha256").update(verifier).digest("base64url");
  if (!safeEqual(expected, row.codeChallenge)) {
    throw new OAuthError("invalid_grant", "PKCE verification failed");
  }

  const grant = await upsertGrant(client.id, row.userId, row.scopes);
  return mintTokenPair(grant.id, row.scopes);
}

export async function refreshAccessToken(
  client: OAuthClient,
  body: Record<string, string | undefined>
): Promise<IssuedTokens> {
  const refreshToken = body.refresh_token;
  if (!refreshToken) {
    throw new OAuthError("invalid_request", "Missing refresh_token");
  }

  const [row] = await db
    .select({ token: oauthTokens, grant: oauthGrants })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .where(eq(oauthTokens.tokenHash, hashToken(refreshToken)))
    .limit(1);

  if (
    !row ||
    row.token.kind !== "refresh" ||
    row.grant.clientId !== client.id
  ) {
    throw new OAuthError("invalid_grant", "Invalid refresh token");
  }
  if (row.token.revokedAt) {
    // A rotated refresh token showing up again means it leaked: cut the whole
    // grant so neither party keeps access (RFC 6819 §5.2.2.3).
    await revokeGrant(row.grant.id);
    throw new OAuthError(
      "invalid_grant",
      "Refresh token reuse detected; grant revoked"
    );
  }
  if (row.grant.revokedAt || row.token.expiresAt < Date.now()) {
    throw new OAuthError("invalid_grant", "Refresh token expired or revoked");
  }

  let scopes = row.token.scopes;
  const requested = parseScopes(body.scope);
  if (requested.length) {
    if (requested.some((scope) => !scopes.includes(scope))) {
      throw new OAuthError(
        "invalid_scope",
        "Requested scope exceeds the original grant"
      );
    }
    scopes = requested;
  }

  const now = Date.now();
  await db
    .update(oauthTokens)
    .set({ revokedAt: now })
    .where(eq(oauthTokens.id, row.token.id));
  await db
    .update(oauthGrants)
    .set({ lastUsedAt: now })
    .where(eq(oauthGrants.id, row.grant.id));

  return mintTokenPair(row.grant.id, scopes);
}

// --- Verification / revocation -----------------------------------------------

export async function verifyAccessToken(token: string) {
  const [row] = await db
    .select({ token: oauthTokens, grant: oauthGrants, user: users })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .innerJoin(users, eq(users.id, oauthGrants.userId))
    .where(eq(oauthTokens.tokenHash, hashToken(token)))
    .limit(1);

  if (!row || row.token.kind !== "access") return null;
  if (row.token.revokedAt || row.grant.revokedAt) return null;
  if (row.token.expiresAt < Date.now()) return null;

  // Usage tracking must never fail the request.
  void db
    .update(oauthGrants)
    .set({ lastUsedAt: Date.now() })
    .where(eq(oauthGrants.id, row.grant.id))
    .catch(() => {});

  return { user: row.user, scopes: row.token.scopes };
}

export async function revokeGrant(grantId: number): Promise<void> {
  const now = Date.now();
  await db
    .update(oauthGrants)
    .set({ revokedAt: now })
    .where(eq(oauthGrants.id, grantId));
  await db
    .update(oauthTokens)
    .set({ revokedAt: now })
    .where(
      and(eq(oauthTokens.grantId, grantId), isNull(oauthTokens.revokedAt))
    );
}

/**
 * RFC 7009: revoking a refresh token tears down the grant, revoking an access
 * token only invalidates that token.
 */
export async function revokeToken(
  client: OAuthClient,
  token: string
): Promise<void> {
  const [row] = await db
    .select({ token: oauthTokens, grant: oauthGrants })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grantId))
    .where(eq(oauthTokens.tokenHash, hashToken(token)))
    .limit(1);
  if (!row || row.grant.clientId !== client.id) return;
  if (row.token.kind === "refresh") {
    await revokeGrant(row.grant.id);
  } else {
    await db
      .update(oauthTokens)
      .set({ revokedAt: Date.now() })
      .where(eq(oauthTokens.id, row.token.id));
  }
}

// --- HTTP helpers ------------------------------------------------------------

export function sendOAuthError(event: H3Event, error: OAuthError) {
  setResponseStatus(event, error.status);
  setResponseHeader(event, "Cache-Control", "no-store");
  if (error.status === 401) {
    setResponseHeader(event, "WWW-Authenticate", 'Basic realm="mcsm"');
  }
  return { error: error.code, error_description: error.description };
}

/** Clients send either form-encoded or JSON bodies; flatten both to strings. */
export async function readOAuthBody(
  event: H3Event
): Promise<Record<string, string | undefined>> {
  const body = (await readBody(event)) as unknown;
  if (!body || typeof body !== "object") return {};
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
    else if (value != null) out[key] = String(value);
  }
  return out;
}

export function oauthMetadata(event: H3Event) {
  const endpoints = oauthEndpoints(getOAuthIssuer(event));
  return {
    /** RFC 8414 authorization server metadata. */
    authorizationServer: {
      issuer: endpoints.issuer,
      authorization_endpoint: endpoints.authorization_endpoint,
      token_endpoint: endpoints.token_endpoint,
      registration_endpoint: endpoints.registration_endpoint,
      revocation_endpoint: endpoints.revocation_endpoint,
      scopes_supported: [...TOKEN_SCOPES],
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: [...TOKEN_ENDPOINT_AUTH_METHODS],
      revocation_endpoint_auth_methods_supported: [
        ...TOKEN_ENDPOINT_AUTH_METHODS,
      ],
      code_challenge_methods_supported: ["S256"],
    },
    /** RFC 9728 protected resource metadata for /mcp. */
    protectedResource: {
      resource: endpoints.resource,
      authorization_servers: [endpoints.issuer],
      scopes_supported: [...TOKEN_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "MCSM",
    },
  };
}
