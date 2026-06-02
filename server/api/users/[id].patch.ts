import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { users } from "../../db/schema";

/**
 * Update an account (admin only): rename, set/replace the password, or toggle
 * admin. Admins cannot demote themselves so the instance always keeps at
 * least one admin.
 */
export default defineEventHandler(async (event) => {
  const requester = await requireAdmin(event);

  const { id } = await useValidatedParams(event, {
    id: z.coerce.number().int(),
  });
  const body = await useValidatedBody(event, {
    name: z.string().min(1).max(100).optional(),
    password: z.string().min(8).max(255).optional(),
    admin: z.boolean().optional(),
  });

  if (body.admin === false && id === requester.id) {
    throw createError({
      statusCode: 400,
      statusMessage: "You cannot remove your own admin role",
    });
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.password ? { password: await hashPassword(body.password) } : {}),
      ...(body.admin !== undefined ? { admin: body.admin } : {}),
    })
    .where(eq(users.id, id))
    .returning();

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: "Unknown user" });
  }

  return sessionUser(updated);
});
