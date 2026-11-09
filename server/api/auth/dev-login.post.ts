import { asc, eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { users } from "../../db/schema";

/**
 * One-click login as the first admin, for local development only. The
 * `import.meta.dev` check is replaced at build time, so production bundles
 * only contain the 404.
 */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.admin, true))
    .orderBy(asc(users.id))
    .limit(1);
  if (!admin) {
    throw createError({
      statusCode: 404,
      statusMessage: "No admin yet. Run the setup first.",
    });
  }

  await loginUser(event, admin);

  return sessionUser(admin);
});
