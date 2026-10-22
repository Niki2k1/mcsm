import * as v from "valibot";

/** Create a backup of the server's world volume. */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { label } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        label: v.optional(v.pipe(v.string(), v.maxLength(100))),
      })
    )
  );

  return createBackup(event, id, label);
});
