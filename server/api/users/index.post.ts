import { z } from "zod";
import { db } from "@nuxthub/db";
import { users } from "../../db/schema";

/**
 * Create an account (admin only). A password is optional — without one the
 * new user can only sign in with Microsoft (matching email) until they get
 * a password or register a passkey.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const body = await useValidatedBody(event, {
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(255).optional(),
    admin: z.boolean().default(false),
  });

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
