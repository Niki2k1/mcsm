import type { H3Event } from "h3";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { apiTokens, users } from "../db/schema";
import type { UserRow } from "./auth";
import type { TokenScope } from "#shared/utils/tokenScopes";

/**
 * Bearer authentication shared by /mcp and the public API: OAuth access
 * tokens (minted by oauth.ts) and personal access tokens (minted in the user
 * menu). Either way the request acts as a real user, so the per-server roles
 * from serverAccess.ts apply on top of the token's scopes, and a personal
 * token's server restriction on top of that (see tokenAccess.ts).
 */

export const PERSONAL_TOKEN_PREFIX = "mcsm_pat_";

export type BearerAuth = {
  user: UserRow;
  scopes: string[];
  kind: "oauth" | "token";
  /** Personal access token id; null for OAuth. */
  tokenId: number | null;
  /** World volumes the token is limited to; null = no restriction. */
  servers: string[] | null;
};

/** Throttle for lastUsedAt writes — once a minute is plenty for the UI. */
const LAST_USED_GRANULARITY_MS = 60_000;

export async function createPersonalToken(
  userId: number,
  input: {
    name: string;
    scopes: TokenScope[];
    servers: string[] | null;
    expiresAt: number | null;
  }
) {
  const token = randomToken(PERSONAL_TOKEN_PREFIX);
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name: input.name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, PERSONAL_TOKEN_PREFIX.length + 4),
      scopes: input.scopes,
      servers: input.servers,
      expiresAt: input.expiresAt,
      createdAt: Date.now(),
    })
    .returning({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scopes: apiTokens.scopes,
      servers: apiTokens.servers,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
    });
  return { ...row!, token };
}

async function verifyPersonalToken(token: string): Promise<BearerAuth | null> {
  const [row] = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  if (isTokenExpired(row.token.expiresAt, now)) return null;
  if (
    !row.token.lastUsedAt ||
    now - row.token.lastUsedAt > LAST_USED_GRANULARITY_MS
  ) {
    void db
      .update(apiTokens)
      .set({ lastUsedAt: now })
      .where(eq(apiTokens.id, row.token.id))
      .catch(() => {});
  }
  return {
    user: row.user,
    scopes: row.token.scopes,
    kind: "token",
    tokenId: row.token.id,
    servers: row.token.servers ?? null,
  };
}

export async function deletePersonalToken(userId: number, id: number) {
  const deleted = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id });
  return deleted.length > 0;
}

/**
 * Drop a deleted world from every token restriction. Otherwise a new server
 * that reuses the volume name later would silently fall into the old scope.
 */
export async function forgetTokenServer(volume: string) {
  const rows = await db
    .select({ id: apiTokens.id, servers: apiTokens.servers })
    .from(apiTokens)
    .where(isNotNull(apiTokens.servers));
  for (const row of rows) {
    if (!row.servers?.includes(volume)) continue;
    // An empty list keeps the token restricted (to nothing) rather than
    // turning it into an unrestricted one.
    await db
      .update(apiTokens)
      .set({ servers: row.servers.filter((entry) => entry !== volume) })
      .where(eq(apiTokens.id, row.id));
  }
}

export async function authenticateBearer(
  event: H3Event
): Promise<BearerAuth | null> {
  const header = getHeader(event, "authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  const token = match?.[1];
  if (!token) return null;

  if (token.startsWith(ACCESS_TOKEN_PREFIX)) {
    // OAuth tokens expire on their own (verifyAccessToken) and cover every
    // server the user can access.
    const verified = await verifyAccessToken(token);
    return verified
      ? { ...verified, kind: "oauth", tokenId: null, servers: null }
      : null;
  }
  if (token.startsWith(PERSONAL_TOKEN_PREFIX)) {
    return verifyPersonalToken(token);
  }
  return null;
}

/** The caller authenticated by the MCP or /api/v1 middleware. */
export function requireBearerAuth(event: H3Event): BearerAuth {
  const auth = event.context.bearerAuth as BearerAuth | undefined;
  if (!auth) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }
  return auth;
}

/**
 * Enforce scope, server restriction and the user's live role for an action
 * on the server backed by `volume`. Returns the user's access level there.
 */
export async function authorizeTokenServer(
  auth: BearerAuth,
  volume: string | null | undefined,
  need: TokenScope
) {
  // Only ask the database about servers inside the restriction.
  const level = tokenCoversServer(auth, volume)
    ? await accessLevel(auth.user, volume)
    : null;
  const access = checkTokenAccess(auth, volume, level, need);
  if (!access.ok) {
    throw createError({
      statusCode: access.statusCode,
      statusMessage: access.statusMessage,
    });
  }
  return level!;
}

/**
 * The servers a token may use with `need`, each with the user's level — for
 * listings that should match what the token can actually act on.
 */
export async function serversForToken<T extends { volume: string | null }>(
  auth: BearerAuth,
  servers: T[],
  need: TokenScope
) {
  const grants = auth.user.admin ? null : await grantsForUser(auth.user.id);
  return servers.flatMap((server) => {
    const level = auth.user.admin
      ? ("admin" as const)
      : server.volume
        ? grants?.get(server.volume)
        : undefined;
    return checkTokenAccess(auth, server.volume, level, need).ok
      ? [{ ...server, access: level! }]
      : [];
  });
}
