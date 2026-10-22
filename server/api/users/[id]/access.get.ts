import * as v from "valibot";
import { eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { serverAccess } from "../../../db/schema";

/** A user's per-server grants (admin only). */
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

  return db
    .select({ volume: serverAccess.volume, role: serverAccess.role })
    .from(serverAccess)
    .where(eq(serverAccess.userId, id));
});
