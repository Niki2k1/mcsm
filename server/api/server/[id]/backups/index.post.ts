import { z } from "zod";

/** Create a backup of the server's world volume. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { label } = await useValidatedBody(event, {
    label: z.string().max(100).optional(),
  });

  return createBackup(event, id, label);
});
