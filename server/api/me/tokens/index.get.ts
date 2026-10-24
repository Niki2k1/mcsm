import { desc, eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { apiTokens } from "../../../db/schema";

/** The logged-in user's personal access tokens (never the token itself). */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      scopes: apiTokens.scopes,
      servers: apiTokens.servers,
      expiresAt: apiTokens.expiresAt,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, user.id))
    .orderBy(desc(apiTokens.createdAt));
});
