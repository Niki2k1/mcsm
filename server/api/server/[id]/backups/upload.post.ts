import { z } from "zod";

/**
 * Upload a backup tarball (.tar.gz of a world's /data directory).
 *
 * The request body is the raw file stream — no multipart parsing, so uploads
 * of any size stream straight through to the backup volume without being
 * buffered in memory.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { label } = await useValidatedQuery(event, {
    label: z.string().max(100).optional(),
  });

  return uploadBackup(event, id, event.node.req, label);
});
