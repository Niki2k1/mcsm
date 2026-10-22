import * as v from "valibot";
import { db } from "@nuxthub/db";
import { users } from "../../db/schema";

/**
 * Create an account (admin only). A password is optional — without one the
 * new user can only sign in with Microsoft (matching email) until they get
 * a password or register a passkey.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const body = await readValidatedBody(
    event,
    v.parser(
      v.object({
        name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
        email: v.pipe(v.string(), v.email()),
        password: v.optional(
          v.pipe(v.string(), v.minLength(8), v.maxLength(255))
        ),
        admin: v.optional(v.boolean(), false),
      })
    )
  );

  const email = body.email.toLowerCase().trim();

  if (await findUserByEmail(email)) {
    throw createError({
      statusCode: 409,
      statusMessage: "A user with this email already exists",
    });
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      name: body.name.trim(),
      password: body.password ? await hashPassword(body.password) : null,
      admin: body.admin,
      createdAt: Date.now(),
    })
    .returning();

  return sessionUser(user!);
});
