import type { H3Event } from "h3";
import { and, eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { serverAccess, users } from "../db/schema";
import type { UserRow } from "./auth";
import {
  hasServerAccess,
  type ServerAccessLevel,
  type ServerRole,
} from "#shared/utils/serverRoles";

/**
 * Per-server authorization. Enforced centrally in the auth middleware so new
 * routes under /api/server/[id]/ are covered without each handler opting in.
 */

/** Routes a viewer may call; everything not listed falls back to manager. */
const VIEWER_ROUTES = new Set([
  "GET ",
  "GET activity",
  "GET stats",
  "GET stats/history",
  "GET players",
  "GET bluemap/status",
  "GET bluemap/render-status",
  "GET pregen/status",
  "GET pregen/stream",
]);

const OPERATOR_ROUTES = new Set([
  "GET logs",
  "POST start",
  "POST stop",
  "POST restart",
  "POST rcon",
  "POST players/action",
]);

/** Routes that create or destroy whole servers stay with admins. */
const ADMIN_ROUTES = new Set(["DELETE ", "POST duplicate"]);

/**
 * Role needed for `method` on `/api/server/<id>/<subpath>`. Unknown routes
 * default to manager, so a forgotten entry errs on the side of denying.
 */
export function requiredServerRole(
  method: string,
  subpath: string
): ServerAccessLevel {
  const key = `${method.toUpperCase()} ${subpath.replace(/^\/+|\/+$/g, "")}`;
  if (ADMIN_ROUTES.has(key)) return "admin";
  if (VIEWER_ROUTES.has(key)) return "viewer";
  if (OPERATOR_ROUTES.has(key)) return "operator";
  return "manager";
}

/**
 * The requesting user, read fresh from the DB rather than trusted from the
 * session cookie: an admin who got demoted (or a deleted user) must lose
 * access immediately, not when their session expires.
 */
export async function currentUser(event: H3Event) {
  if (event.context.currentUser !== undefined) {
    return event.context.currentUser as UserRow | null;
  }
  const session = await getUserSession(event);
  let user: UserRow | null = null;
  if (session.user) {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    user = row ?? null;
    if (!user) {
      await clearUserSession(event);
    } else if (user.admin !== session.user.admin || user.name !== session.user.name) {
      // Keeps the client UI (admin links etc.) in sync with the DB.
      await setUserSession(event, {
        user: sessionUser(user),
        loggedInAt: session.loggedInAt,
      });
    }
  }
  event.context.currentUser = user;
  return user;
}

/** volume → role for every server the user was granted. */
export async function grantsForUser(userId: number) {
  const rows = await db
    .select({ volume: serverAccess.volume, role: serverAccess.role })
    .from(serverAccess)
    .where(eq(serverAccess.userId, userId));
  return new Map(rows.map((row) => [row.volume, row.role as ServerRole]));
}

export async function accessLevel(
  user: UserRow,
  volume: string | null | undefined
): Promise<ServerAccessLevel | null> {
  if (user.admin) return "admin";
  if (!volume) return null;
  const [row] = await db
    .select({ role: serverAccess.role })
    .from(serverAccess)
    .where(and(eq(serverAccess.userId, user.id), eq(serverAccess.volume, volume)))
    .limit(1);
  return (row?.role as ServerRole | undefined) ?? null;
}

/** Throws 403 unless the user has at least `need` on the server's volume. */
export async function assertServerAccess(
  user: UserRow,
  volume: string | null | undefined,
  need: ServerAccessLevel
) {
  const level = await accessLevel(user, volume);
  if (!hasServerAccess(level, need)) {
    // Servers the user can't see at all look nonexistent, like in the list.
    throw createError(
      level
        ? { statusCode: 403, statusMessage: "Insufficient permissions for this server" }
        : { statusCode: 404, statusMessage: "Server not found" }
    );
  }
  return level!;
}

/** Drop all grants for a world that no longer exists. */
export async function revokeServerAccess(volume: string) {
  await db.delete(serverAccess).where(eq(serverAccess.volume, volume));
}
