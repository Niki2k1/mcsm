import { z } from "zod";

/** Clear a known secret. Existing containers keep their baked-in value until
 *  they are re-applied or recreated. */
export default defineEventHandler(async (event) => {
  const { key } = await useValidatedParams(event, { key: z.string() });

  if (!isKnownSecret(key)) {
    throw createError({ statusCode: 404, statusMessage: "Unknown secret" });
  }

  await useSecrets().remove(key);

  return { key, set: false };
});
