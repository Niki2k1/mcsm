import { z } from "zod";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

/**
 * Upload a resource pack (.zip).
 *
 * Unlike the server icon, resource packs are downloaded by the players' game
 * clients, so the file must be reachable over HTTP — MCSM stores it in .data
 * and serves it publicly via /api/resource-packs/[file]. The response returns
 * the absolute URL + SHA1 to put into the server config.
 */

const PACKS_DIR = ".data/resource-packs";

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

  await mkdir(PACKS_DIR, { recursive: true });

  const filename = `${server.volume}-${Date.now()}.zip`;
  const filePath = join(PACKS_DIR, filename);

  // Stream the upload to disk while computing its SHA1 (Minecraft uses the
  // hash to know when clients must re-download the pack).
  const hash = createHash("sha1");
  let firstChunk: Uint8Array | null = null;
  const hasher = new Transform({
    transform(chunk: Uint8Array, _encoding, callback) {
      if (!firstChunk) firstChunk = chunk;
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(event.node.req, hasher, createWriteStream(filePath));
  } catch (error) {
    await unlink(filePath).catch(() => {});
    throw error;
  }

  // Zip magic bytes ("PK") — reject obvious non-zip uploads. (TS can't see
  // the assignment inside the Transform callback, hence the assertion.)
  const head = firstChunk as Uint8Array | null;
  if (!head || Buffer.from(head.subarray(0, 2)).toString() !== "PK") {
    await unlink(filePath).catch(() => {});
    throw createError({
      statusCode: 400,
      statusMessage: "The uploaded file is not a .zip resource pack",
    });
  }

  // Replace older packs for this server — their URLs are dead weight once the
  // config points at the new one.
  for (const existing of await readdir(PACKS_DIR)) {
    if (existing.startsWith(`${server.volume}-`) && existing !== filename) {
      await unlink(join(PACKS_DIR, existing)).catch(() => {});
    }
  }

  // Build the public URL from the request so it works wherever MCSM is hosted.
  const origin = getRequestURL(event).origin;

  return {
    url: `${origin}/api/resource-packs/${filename}`,
    sha1: hash.digest("hex"),
  };
});
