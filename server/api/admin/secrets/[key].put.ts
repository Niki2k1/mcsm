import * as v from "valibot";

/** Set (or replace) a known secret. The value is stored, never echoed back. */
export default defineEventHandler(async (event) => {
  const { key } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ key: v.string() }))
  );
  const { value } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        value: v.pipe(v.string(), v.minLength(1)),
      })
    )
  );

  if (!isKnownSecret(key)) {
    throw createError({ statusCode: 404, statusMessage: "Unknown secret" });
  }

  await useSecrets().set(key, value.trim());

  return { key, set: true };
});
