import { z } from "zod";
import { readServerIcon } from "../../../utils/minecraft/icon";

/** Serve the server's current icon PNG, or 404 if none is set. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const icon = await readServerIcon(event, id);
  if (!icon) {
    throw createError({ statusCode: 404, statusMessage: "No icon set" });
  }

  setHeader(event, "Content-Type", "image/png");
  // The client cache-busts with a query param after each change, so the
  // immutable bytes are safe to cache briefly.
  setHeader(event, "Cache-Control", "public, max-age=300");
  return icon;
});
