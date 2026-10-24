import type { H3Event } from "h3";
import { TOKEN_SCOPE_ROLE, type TokenScope } from "#shared/utils/tokenScopes";

/** Helpers for MCP tools, on top of the shared bearer auth (bearerAuth.ts). */

export function useMcpAuth(): BearerAuth {
  const auth = useEvent().context.bearerAuth as BearerAuth | undefined;
  if (!auth) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }
  return auth;
}

export function hasMcpScope(event: H3Event, scope: TokenScope) {
  const auth = event.context.bearerAuth as BearerAuth | undefined;
  return Boolean(auth?.scopes.includes(scope));
}

/**
 * Resolve a server the way an LLM tends to name it — container id, display
 * name or world volume — and enforce both the token scope and the user's role
 * on it. Servers the user can't see look nonexistent, like in the dashboard.
 */
export async function requireMcpServer(ref: string, scope: TokenScope) {
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
    TOKEN_SCOPE_ROLE[scope]
  );
  return { server: match, access, docker, event };
}
