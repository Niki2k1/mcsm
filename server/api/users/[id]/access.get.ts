import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { serverAccess } from "../../../db/schema";

/** A user's per-server grants (admin only). */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const { id } = await useValidatedParams(event, {
    id: z.coerce.number().int(),
  });

  return db
    .select({ volume: serverAccess.volume, role: serverAccess.role })
    .from(serverAccess)
    .where(eq(serverAccess.userId, id));
});
