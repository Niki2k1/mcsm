import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { oauthClients, oauthGrants } from "../../../db/schema";

/** Apps the logged-in user connected through OAuth (active grants only). */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  return db
    .select({
      id: oauthGrants.id,
      name: oauthClients.name,
      clientUri: oauthClients.clientUri,
      scopes: oauthGrants.scopes,
      createdAt: oauthGrants.createdAt,
      lastUsedAt: oauthGrants.lastUsedAt,
    })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(and(eq(oauthGrants.userId, user.id), isNull(oauthGrants.revokedAt)))
    .orderBy(desc(oauthGrants.lastUsedAt));
});
