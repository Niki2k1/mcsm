import { z } from "zod";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Serves uploaded resource packs. This must be publicly reachable — players'
 * game clients download the pack from here when joining the server.
 */
export default defineEventHandler(async (event) => {
  const { file } = await useValidatedParams(event, {
    // mc-<volume>-<timestamp>.zip — also blocks any path traversal.
    file: z.string().regex(/^[a-z0-9-]+-\d+\.zip$/),
  });

  const filePath = join(".data/resource-packs", file);

  let info;
  try {
    info = await stat(filePath);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Pack not found" });
  }

  setHeader(event, "Content-Type", "application/zip");
  setHeader(event, "Content-Length", info.size);
  // Packs never change under the same name (uploads create new names).
  setHeader(event, "Cache-Control", "public, max-age=31536000, immutable");

  return sendStream(event, createReadStream(filePath));
});
