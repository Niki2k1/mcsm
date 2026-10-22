import * as v from "valibot";
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

  const { id } = await getValidatedRouterParams(
    event,
    v.parser(
      v.object({
        id: v.pipe(v.string(), v.toNumber(), v.integer()),
      })
    )
  );
  const body = await readValidatedBody(
    event,
    v.parser(
      v.object({
        name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
        password: v.optional(
          v.pipe(v.string(), v.minLength(8), v.maxLength(255))
        ),
        admin: v.optional(v.boolean()),
      })
    )
  );

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
