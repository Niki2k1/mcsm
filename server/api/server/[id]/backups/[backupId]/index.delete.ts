import * as v from "valibot";

/** Delete a backup tarball and its metadata. */
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

  return deleteBackup(event, id, backupId);
});
