import { z } from "zod";
import { db } from "@nuxthub/db";
import { users } from "../../db/schema";

/**
 * First-run setup (public, but only works once): create the initial admin
 * account and log it in. Rejected as soon as any account exists.
 */
export default defineEventHandler(async (event) => {
  const body = await useValidatedBody(event, {
    name: z.string().min(1).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(255),
  });

  if (!(await needsSetup())) {
    throw createError({
      statusCode: 403,
      statusMessage: "Setup has already been completed",
    });
  }

  const [user] = await db
    .insert(users)
    .values({
      email: body.email.toLowerCase().trim(),
      name: body.name.trim(),
      password: await hashPassword(body.password),
      admin: true,
      createdAt: Date.now(),
    })
    .returning();

  await loginUser(event, user!);

  return sessionUser(user!);
});
