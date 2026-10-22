import * as v from "valibot";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Serves uploaded server icons. Publicly reachable — the itzg image downloads
 * the icon from here when the Minecraft container starts, and the UI uses the
 * same URL for previews.
 */
export default defineEventHandler(async (event) => {
  const { file } = await getValidatedRouterParams(
    event,
    v.parser(
      v.object({
        // <volume>-<timestamp>.png — also blocks any path traversal.
        file: v.pipe(v.string(), v.regex(/^[a-z0-9-]+-\d+\.png$/)),
      })
    )
  );

  const filePath = join(".data/icons", file);

  let info;
  try {
    info = await stat(filePath);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Icon not found" });
  }

  setHeader(event, "Content-Type", "image/png");
  setHeader(event, "Content-Length", info.size);
  // Icons never change under the same name (uploads create new names).
  setHeader(event, "Cache-Control", "public, max-age=31536000, immutable");

  return sendStream(event, createReadStream(filePath));
});
