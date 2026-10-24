import type { H3Event } from "h3";
import { hasTokenScope, type TokenScope } from "#shared/utils/tokenScopes";

/** Helpers for MCP tools, on top of the shared bearer auth (bearerAuth.ts). */

export function useMcpAuth(): BearerAuth {
  return requireBearerAuth(useEvent());
}

export function hasMcpScope(event: H3Event, scope: TokenScope) {
  const auth = event.context.bearerAuth as BearerAuth | undefined;
  return Boolean(auth && hasTokenScope(auth.scopes, scope));
}

/**
 * Resolve a server the way an LLM tends to name it — container id, display
 * name or world volume — and enforce the token scope, the token's server
 * restriction and the user's role on it. Servers the token can't see look
 * nonexistent, like in the dashboard.
 */
export async function requireMcpServer(ref: string, scope: TokenScope) {
  const event = useEvent();
  const auth = useMcpAuth();
  if (!hasTokenScope(auth.scopes, scope)) {
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

  const access = await authorizeTokenServer(auth, match.volume, scope);
  return { server: match, access, docker, event };
}
