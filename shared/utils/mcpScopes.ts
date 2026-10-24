import type { ServerRole } from "./serverRoles";

/**
 * What an MCP client (OAuth grant or personal token) may do. Scopes mirror the
 * per-server roles one to one: a tool needs both the matching scope and at
 * least that role on the server, so a token can narrow a user's access but
 * never widen it.
 */
export const MCP_SCOPES = [
  "servers:read",
  "servers:operate",
  "servers:manage",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_SCOPE_ROLE: Record<McpScope, ServerRole> = {
  "servers:read": "viewer",
  "servers:operate": "operator",
  "servers:manage": "manager",
};

export const MCP_SCOPE_LABELS: Record<
  McpScope,
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
};

export function isMcpScope(value: string): value is McpScope {
  return (MCP_SCOPES as readonly string[]).includes(value);
}
