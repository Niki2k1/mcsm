import * as v from "valibot";

/** Rename or move a file or folder. Never replaces an existing target. */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { from, to } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        from: v.pipe(v.string(), v.minLength(1)),
        to: v.pipe(v.string(), v.minLength(1)),
      })
    )
  );
  const server = await getFileManagerServer(event, id);

  const moved = await moveEntry(
    id,
    server.config?.type,
    server.config?.LEVEL,
    from,
    to
  );

  await recordActivity(
    server.volume,
    "file-moved",
    `${moved.from} → ${moved.to}`
  );
  return moved;
});
