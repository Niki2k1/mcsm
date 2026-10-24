import {
  hasTokenScope,
  TOKEN_SCOPE_ROLE,
  type TokenScope,
} from "../../shared/utils/tokenScopes";
import {
  hasServerAccess,
  type ServerAccessLevel,
} from "../../shared/utils/serverRoles";

/**
 * Pure access rules for bearer tokens, shared by MCP tools and the public API.
 * Kept free of database imports so they can be unit-tested.
 */

export type TokenLimits = {
  scopes: readonly string[];
  /** World volumes the token is limited to; null = no restriction. */
  servers: readonly string[] | null;
};

export function isTokenExpired(expiresAt: number | null, now = Date.now()) {
  return expiresAt !== null && expiresAt <= now;
}

/** Whether a token's server restriction lets it see the world `volume`. */
export function tokenCoversServer(
  limits: Pick<TokenLimits, "servers">,
  volume: string | null | undefined
) {
  if (!limits.servers) return true;
  return !!volume && limits.servers.includes(volume);
}

export type TokenAccess =
  | { ok: true }
  | { ok: false; statusCode: 403 | 404; statusMessage: string };

/**
 * Whether a token may act with `need` on the server backed by `volume`, given
 * the user's current level there. Scope, server restriction and the live role
 * must all allow it, so demoting a user also narrows every token they made.
 */
export function checkTokenAccess(
  limits: TokenLimits,
  volume: string | null | undefined,
  level: ServerAccessLevel | null | undefined,
  need: TokenScope
): TokenAccess {
  if (!hasTokenScope(limits.scopes, need)) {
    return {
      ok: false,
      statusCode: 403,
      statusMessage: `This token lacks the ${need} scope`,
    };
  }
  // Servers outside the restriction look nonexistent, like servers the user
  // can't see at all.
  if (!tokenCoversServer(limits, volume) || !level) {
    return { ok: false, statusCode: 404, statusMessage: "Server not found" };
  }
  if (!hasServerAccess(level, TOKEN_SCOPE_ROLE[need])) {
    return {
      ok: false,
      statusCode: 403,
      statusMessage: "Insufficient permissions for this server",
    };
  }
  return { ok: true };
}
