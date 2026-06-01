import { z } from "zod";

/** Delete a backup tarball and its metadata. */
export default defineEventHandler(async (event) => {
  const { id, backupId } = await useValidatedParams(event, {
    id: z.string(),
    backupId: z.coerce.number().int(),
  });

  return deleteBackup(event, id, backupId);
});
