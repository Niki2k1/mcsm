import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { users } from "../../db/schema";

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

  const deleted = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning({ id: users.id });

  if (!deleted.length) {
    throw createError({ statusCode: 404, statusMessage: "Unknown user" });
  }

  return { deleted: true };
});
