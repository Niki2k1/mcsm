import { z } from "zod";

/** Set (or replace) a known secret. The value is stored, never echoed back. */
export default defineEventHandler(async (event) => {
  const { key } = await useValidatedParams(event, { key: z.string() });
  const { value } = await useValidatedBody(event, {
    value: z.string().min(1),
  });

  if (!isKnownSecret(key)) {
    throw createError({ statusCode: 404, statusMessage: "Unknown secret" });
  }

  await useSecrets().set(key, value.trim());

  return { key, set: true };
});
