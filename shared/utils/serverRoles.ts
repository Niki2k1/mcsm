/**
 * Per-server access levels. Each role includes everything the roles before it
 * can do; admins implicitly have full access to every server.
 *
 *  - viewer:   overview, players, analytics, map
 *  - operator: + start/stop/restart, console, player actions
 *  - manager:  + configuration, files, mods, backups, world, settings
 */
export const SERVER_ROLES = ["viewer", "operator", "manager"] as const;

export type ServerRole = (typeof SERVER_ROLES)[number];

/** What a user may do on one server; `admin` is the global admin flag. */
export type ServerAccessLevel = ServerRole | "admin";

const RANK: Record<ServerAccessLevel, number> = {
  viewer: 1,
  operator: 2,
  manager: 3,
  admin: 4,
};

export function hasServerAccess(
  have: ServerAccessLevel | null | undefined,
  need: ServerAccessLevel
) {
  return Boolean(have) && RANK[have!] >= RANK[need];
}
