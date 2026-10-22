import * as v from "valibot";

/** Delete a file, or a folder with everything in it. */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { path } = await getValidatedQuery(
    event,
    v.parser(v.object({ path: v.pipe(v.string(), v.minLength(1)) }))
  );
  const server = await getFileManagerServer(event, id);

  const deleted = await deleteEntry(
    id,
    server.config?.type,
    server.config?.LEVEL,
    path
  );

  await recordActivity(server.volume, "file-deleted", deleted);
  return { path: deleted };
});
