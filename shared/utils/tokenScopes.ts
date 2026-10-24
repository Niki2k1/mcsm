import type { ServerRole } from "./serverRoles";

/**
 * What a bearer token (OAuth grant or personal access token) may do, on the
 * MCP endpoint and the public API alike. Each scope maps to a per-server role:
 * an action needs both the scope and at least that role on the server, so a
 * token can narrow a user's access but never widen it.
 */
export const TOKEN_SCOPES = [
  "servers:read",
  "servers:operate",
  "servers:manage",
  "players:whitelist",
] as const;

export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const TOKEN_SCOPE_ROLE: Record<TokenScope, ServerRole> = {
  "servers:read": "viewer",
  "servers:operate": "operator",
  "servers:manage": "manager",
  "players:whitelist": "operator",
};

export const TOKEN_SCOPE_LABELS: Record<
  TokenScope,
  { label: string; description: string }
> = {
  "servers:read": {
    label: "Read",
    description: "List servers and see their status, players and activity",
  },
  "servers:operate": {
    label: "Operate",
    description:
      "Start, stop and restart servers, read logs, run console commands and manage players",
  },
  "servers:manage": {
    label: "Manage",
    description: "List and create backups",
  },
  "players:whitelist": {
    label: "Whitelist",
    description:
      "Add and remove whitelisted players, without console or power controls (e.g. for a Discord bot)",
  },
};

/**
 * Narrow scopes that a broader one already covers: Operate manages players,
 * so it can do everything Whitelist can.
 */
const IMPLIED_BY: Partial<Record<TokenScope, TokenScope[]>> = {
  "players:whitelist": ["servers:operate"],
};

/** Whether granted `scopes` allow `need`, directly or through a broader scope. */
export function hasTokenScope(scopes: readonly string[], need: TokenScope) {
  return (
    scopes.includes(need) ||
    (IMPLIED_BY[need] ?? []).some((scope) => scopes.includes(scope))
  );
}

export function isTokenScope(value: string): value is TokenScope {
  return (TOKEN_SCOPES as readonly string[]).includes(value);
}
