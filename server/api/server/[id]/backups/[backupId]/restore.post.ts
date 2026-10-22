import * as v from "valibot";

/**
 * Restore a backup into the server's world volume. Stops the server during
 * the restore and starts it again afterwards.
 */
export default defineEventHandler(async (event) => {
  const { id, backupId } = await getValidatedRouterParams(
    event,
    v.parser(
      v.object({
        id: v.string(),
        backupId: v.pipe(v.string(), v.toNumber(), v.integer()),
      })
    )
  );

  return restoreBackup(event, id, backupId);
});
