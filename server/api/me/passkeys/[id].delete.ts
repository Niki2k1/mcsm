import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { credentials } from "../../../db/schema";

/** Remove one of the logged-in user's own passkeys. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { id } = await useValidatedParams(event, { id: z.string().min(1) });

  const deleted = await db
    .delete(credentials)
    .where(and(eq(credentials.id, id), eq(credentials.userId, user.id)))
    .returning({ id: credentials.id });

  if (!deleted.length) {
    throw createError({ statusCode: 404, statusMessage: "Unknown passkey" });
  }

  return { deleted: true };
});
