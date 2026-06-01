import { z } from "zod";

/**
 * Restore a backup into the server's world volume. Stops the server during
 * the restore and starts it again afterwards.
 */
export default defineEventHandler(async (event) => {
  const { id, backupId } = await useValidatedParams(event, {
    id: z.string(),
    backupId: z.coerce.number().int(),
  });

  return restoreBackup(event, id, backupId);
});
