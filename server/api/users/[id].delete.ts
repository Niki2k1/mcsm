import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { serverAccess, users } from "../../db/schema";

/**
 * Delete an account (admin only). Self-deletion is blocked so the instance
 * can't end up with zero admins. Passkeys cascade-delete with the user.
 */
export default defineEventHandler(async (event) => {
  const requester = await requireAdmin(event);

  const { id } = await useValidatedParams(event, {
    id: z.coerce.number().int(),
  });

  if (id === requester.id) {
    throw createError({
      statusCode: 400,
      statusMessage: "You cannot delete your own account",
    });
  }

  // Explicit rather than relying on the FK cascade: SQLite only enforces it
  // when foreign_keys is on for the connection.
  await db.delete(serverAccess).where(eq(serverAccess.userId, id));

  const deleted = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning({ id: users.id });

  if (!deleted.length) {
    throw createError({ statusCode: 404, statusMessage: "Unknown user" });
  }

  return { deleted: true };
});
