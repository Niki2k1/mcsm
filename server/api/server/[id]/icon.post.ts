import { z } from "zod";
import Jimp from "jimp-compact";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Upload a server icon.
 *
 * The image (already converted to 64x64 PNG by the browser) is stored in
 * .data and served at a public URL. That URL goes into the config's ICON
 * field — itzg downloads it whenever the container is (re)created — and the
 * same URL drives every preview in the UI.
 */

const ICONS_DIR = ".data/icons";
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

  // Whatever arrives, re-encode to a guaranteed 64x64 PNG (defense in depth —
  // the browser already does this conversion for UI uploads).
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

  await mkdir(ICONS_DIR, { recursive: true });

  const filename = `${server.volume}-${Date.now()}.png`;
  // (Cast: Jimp's Buffer type and node:fs's expected type disagree on the
  // underlying ArrayBuffer generic — same bytes either way.)
  await writeFile(join(ICONS_DIR, filename), new Uint8Array(png));

  // Replace older icons for this server — only the newest is referenced.
  for (const existing of await readdir(ICONS_DIR)) {
    if (existing.startsWith(`${server.volume}-`) && existing !== filename) {
      await unlink(join(ICONS_DIR, existing)).catch(() => {});
    }
  }

  await recordActivity(server.volume, "edited", "Server icon uploaded");

  // Relative URL: the browser previews it against the public origin, while
  // serverSpec expands it to MCSM's internal Docker hostname for the container
  // (which can't reach the public domain — NAT hairpin).
  return { url: `/api/icons/${filename}` };
});
