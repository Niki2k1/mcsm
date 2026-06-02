import { eq, count } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { users, credentials } from "../../db/schema";

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

  return rows.map((row) => ({
    ...row,
    hasPassword: Boolean(row.hasPassword),
  }));
});
