import type { H3Event } from "h3";
import * as v from "valibot";
import { hasTokenScope, type TokenScope } from "#shared/utils/tokenScopes";

/**
 * Shared pieces of the public /api/v1 handlers. Responses are built field by
 * field so internal data (container config, env, volumes) never leaks into
 * the public contract by accident.
 */

/** Docker container names, which double as mcsm server ids. */
const SERVER_ID = v.pipe(v.string(), v.regex(/^[A-Za-z0-9][\w.-]{0,127}$/));

export async function readServerIdParam(event: H3Event) {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: SERVER_ID }))
  );
  return id;
}

export const playerNameSchema = v.pipe(
  v.string(),
  v.regex(PLAYER_NAME_PATTERN, "Invalid Minecraft player name")
);

/**
 * Look up a server for a /api/v1 request and check that the token may use
 * `need` on it (scope, server restriction and the user's live role).
 */
export async function requireApiServer(
  event: H3Event,
  id: string,
  need: TokenScope
) {
  const auth = requireBearerAuth(event);
  // Before the lookup, so a token without the scope can't probe which
  // servers exist.
  if (!hasTokenScope(auth.scopes, need)) {
    throw createError({
      statusCode: 403,
      statusMessage: `This token lacks the ${need} scope`,
    });
  }
  let server: Awaited<ReturnType<ReturnType<typeof useDocker>["getServer"]>>;
  try {
    server = await useDocker(event).getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
  await authorizeTokenServer(auth, server.volume, need);
  return server;
}

export function publicServer(server: {
  id: string;
  name: string;
  domain: string;
  running: boolean;
}) {
  return {
    id: server.id,
    name: server.name,
    domain: server.domain || null,
    running: server.running,
  };
}

export function publicPlayer(entry: PlayerListEntry) {
  return { name: entry.name, uuid: entry.uuid };
}
