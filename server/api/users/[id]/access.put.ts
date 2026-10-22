import * as v from "valibot";
import { eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { serverAccess, users } from "../../../db/schema";
import { SERVER_ROLES, type ServerRole } from "#shared/utils/serverRoles";

/**
 * Replace a user's per-server grants (admin only). Servers missing from the
 * list lose access. Admins have full access regardless, so grants for them
 * are stored but have no effect until they are demoted.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const { id } = await getValidatedRouterParams(
    event,
    v.parser(
      v.object({
        id: v.pipe(v.string(), v.toNumber(), v.integer()),
      })
    )
  );
  const { grants } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        grants: v.pipe(
          v.array(
            v.object({
              volume: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
              role: v.picklist(SERVER_ROLES),
            })
          ),
          v.maxLength(1000)
        ),
      })
    )
  );

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: "Unknown user" });
  }

  // useValidatedBody types the array loosely (implicit any in the callbacks).
  const list = grants as { volume: string; role: ServerRole }[];
  const unique = [...new Map(list.map((g) => [g.volume, g])).values()];

  await db.transaction(async (tx) => {
    await tx.delete(serverAccess).where(eq(serverAccess.userId, id));
    if (unique.length) {
      await tx
        .insert(serverAccess)
        .values(unique.map((g) => ({ userId: id, ...g })));
    }
  });

  return unique;
});
