import type { H3Event } from "h3";
import { and, eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { apiTokens, users } from "../db/schema";
import type { UserRow } from "./auth";
import { MCP_SCOPE_ROLE, type McpScope } from "#shared/utils/mcpScopes";

/**
 * Bearer authentication for /mcp: OAuth access tokens (minted by oauth.ts) and
 * personal access tokens (minted in the user menu). Either way the request
 * acts as a real user, so the per-server roles from serverAccess.ts apply on
 * top of the token's scopes.
 */

export const PERSONAL_TOKEN_PREFIX = "mcsm_pat_";

export type McpAuth = {
  user: UserRow;
  scopes: string[];
  kind: "oauth" | "token";
};

/** Throttle for lastUsedAt writes — once a minute is plenty for the UI. */
const LAST_USED_GRANULARITY_MS = 60_000;

export async function createPersonalToken(
  userId: number,
  name: string,
  scopes: McpScope[]
) {
  const token = randomToken(PERSONAL_TOKEN_PREFIX);
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name,
      tokenHash: hashToken(token),
      prefix: token.slice(0, PERSONAL_TOKEN_PREFIX.length + 4),
      scopes,
      createdAt: Date.now(),
    })
    .returning({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scopes: apiTokens.scopes,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    });
  return { ...row!, token };
}

async function verifyPersonalToken(token: string): Promise<McpAuth | null> {
  const [row] = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
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
  return { user: row.user, scopes: row.token.scopes, kind: "token" };
}

export async function deletePersonalToken(userId: number, id: number) {
  const deleted = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id });
  return deleted.length > 0;
}

export async function authenticateBearer(
  event: H3Event
): Promise<McpAuth | null> {
  const header = getHeader(event, "authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  const token = match?.[1];
  if (!token) return null;

  if (token.startsWith(ACCESS_TOKEN_PREFIX)) {
    const verified = await verifyAccessToken(token);
    return verified ? { ...verified, kind: "oauth" } : null;
  }
  if (token.startsWith(PERSONAL_TOKEN_PREFIX)) {
    return verifyPersonalToken(token);
  }
  return null;
}

// --- Inside MCP tools ----------------------------------------------------------

/** The authenticated caller; set by the /mcp middleware. */
export function useMcpAuth(): McpAuth {
  const auth = useEvent().context.mcpAuth as McpAuth | undefined;
  if (!auth) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }
  return auth;
}

export function hasMcpScope(event: H3Event, scope: McpScope) {
  const auth = event.context.mcpAuth as McpAuth | undefined;
  return Boolean(auth?.scopes.includes(scope));
}

/**
 * Resolve a server the way an LLM tends to name it — container id, display
 * name or world volume — and enforce both the token scope and the user's role
 * on it. Servers the user can't see look nonexistent, like in the dashboard.
 */
export async function requireMcpServer(ref: string, scope: McpScope) {
  const event = useEvent();
  const { user, scopes } = useMcpAuth();
  if (!scopes.includes(scope)) {
    throw createError({
      statusCode: 403,
      statusMessage: `This connection lacks the ${scope} scope`,
    });
  }

  const docker = useDocker(event);
  const needle = ref.trim().toLowerCase();
  const servers = await docker.listServers();
  const match =
    servers.find((server) => server.id.toLowerCase() === needle) ??
    servers.find((server) => server.volume?.toLowerCase() === needle) ??
    servers.find((server) => server.name.toLowerCase() === needle);
  if (!match) {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const access = await assertServerAccess(
    user,
    match.volume,
    MCP_SCOPE_ROLE[scope]
  );
  return { server: match, access, docker, event };
}
