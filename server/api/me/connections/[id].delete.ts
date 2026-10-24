import * as v from "valibot";
import { and, eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { oauthGrants } from "../../../db/schema";

/** Disconnect an app: revokes the grant and every token issued for it. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.pipe(v.string(), v.toNumber(), v.integer()) }))
  );
  const [grant] = await db
    .select({ id: oauthGrants.id })
    .from(oauthGrants)
    .where(and(eq(oauthGrants.id, id), eq(oauthGrants.userId, user.id)))
    .limit(1);
  if (!grant) {
    throw createError({
      statusCode: 404,
      statusMessage: "Connection not found",
    });
  }
  await revokeGrant(grant.id);
  return { ok: true };
});
