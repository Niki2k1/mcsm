import { z } from "zod";
import Jimp from "jimp-compact";

/**
 * Upload a server icon. The image is resized to the 64x64 PNG Minecraft
 * requires and written into the world volume as /data/server-icon.png —
 * no external hosting needed. Takes effect on the next server restart.
 */
const MAX_ICON_BYTES = 5 * 1024 * 1024;

export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { getServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
  if (!server.volume) {
    throw createError({ statusCode: 400, statusMessage: "Server has no volume" });
  }

  const body = await readRawBody(event, false);
  if (!body || !Buffer.isBuffer(body)) {
    throw createError({ statusCode: 400, statusMessage: "No image uploaded" });
  }
  if (body.length > MAX_ICON_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Image too large (max 5 MB)",
    });
  }

  // Convert whatever was uploaded (PNG/JPG/...) into the required 64x64 PNG.
  let png: Buffer;
  try {
    const image = await Jimp.read(body);
    png = await image.cover(64, 64).getBufferAsync(Jimp.MIME_PNG);
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "The uploaded file is not a readable image",
    });
  }

  await writeVolumeFile(event, server.volume, "server-icon.png", png);
  await recordActivity(server.volume, "edited", "Server icon uploaded");

  return {
    ok: true,
    note: "The icon takes effect after the next server restart.",
  };
});
