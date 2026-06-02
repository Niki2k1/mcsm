import { eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { credentials } from "../../../db/schema";

/** List the logged-in user's passkeys (id + metadata, never the public key). */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);

  const rows = await db
    .select({
      id: credentials.id,
      name: credentials.name,
      backedUp: credentials.backedUp,
      createdAt: credentials.createdAt,
    })
    .from(credentials)
    .where(eq(credentials.userId, user.id));

  return rows;
});
