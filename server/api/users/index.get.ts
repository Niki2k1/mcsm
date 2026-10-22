import { eq, count } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { users, credentials, serverAccess } from "../../db/schema";

/** List all accounts (admin only). Passwords/keys never leave the server. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      admin: users.admin,
      createdAt: users.createdAt,
      hasPassword: users.password,
      passkeys: count(credentials.id),
    })
    .from(users)
    .leftJoin(credentials, eq(credentials.userId, users.id))
    .groupBy(users.id);

  const grants = await db
    .select({ userId: serverAccess.userId, servers: count() })
    .from(serverAccess)
    .groupBy(serverAccess.userId);
  const serversByUser = new Map(grants.map((g) => [g.userId, g.servers]));

  return rows.map((row) => ({
    ...row,
    hasPassword: Boolean(row.hasPassword),
    servers: serversByUser.get(row.id) ?? 0,
  }));
});
