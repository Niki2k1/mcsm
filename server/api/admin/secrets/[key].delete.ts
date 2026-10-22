import * as v from "valibot";

/** Clear a known secret. Existing containers keep their baked-in value until
 *  they are re-applied or recreated. */
export default defineEventHandler(async (event) => {
  const { key } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ key: v.string() }))
  );

  if (!isKnownSecret(key)) {
    throw createError({ statusCode: 404, statusMessage: "Unknown secret" });
  }

  await useSecrets().remove(key);

  return { key, set: false };
});
