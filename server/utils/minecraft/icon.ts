import type { H3Event } from "h3";
// jimp-compact is the slim Jimp build already used elsewhere — plenty for
// resizing a small icon.
import Jimp from "jimp-compact";

/**
 * Server icon management.
 *
 * Minecraft shows a 64x64 PNG named `server-icon.png` read from the server
 * directory, which here is the named Docker volume mounted at `/data`. Because
 * there is no host-side data directory (Docker is the source of truth), the
 * icon is pushed into and read back from the container filesystem over the
 * Docker archive API (`putArchive` / `getArchive`). Those work whether the
 * container is running or stopped; only removal (via `exec rm`) needs it up.
 */

export const ICON_FILE = "server-icon.png";
export const ICON_PATH = `/data/${ICON_FILE}`;
const ICON_SIZE = 64;

// Reject obviously oversized uploads before handing them to the decoder.
export const MAX_ICON_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

/** Decode an arbitrary image and re-encode it as the required 64x64 PNG. */
export async function processIcon(input: Buffer): Promise<Buffer> {
  let image;
  try {
    image = await Jimp.read(input);
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "The uploaded file is not a valid image",
    });
  }

  // `cover` scales and center-crops to fill the box without distorting.
  return image.cover(ICON_SIZE, ICON_SIZE).getBufferAsync(Jimp.MIME_PNG);
}

// ---------------------------------------------------------------------------
// Minimal single-file USTAR tar helpers. putArchive/getArchive speak tar and
// the project has no tar dependency, so we build/parse one file by hand.
// ---------------------------------------------------------------------------

function writeOctal(buf: Buffer, value: number, offset: number, length: number) {
  // Numeric tar fields are octal ASCII, zero-padded, with a trailing NUL.
  buf.write(value.toString(8).padStart(length - 1, "0"), offset, length - 1, "ascii");
}

export function tarSingleFile(name: string, content: Buffer): Buffer {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 0o644, 100, 8); // mode
  writeOctal(header, 0, 108, 8); // uid
  writeOctal(header, 0, 116, 8); // gid
  writeOctal(header, content.length, 124, 12); // size
  writeOctal(header, Math.floor(Date.now() / 1000), 136, 12); // mtime
  header.write("0", 156, 1, "ascii"); // typeflag: regular file
  header.write("ustar\0", 257, 6, "ascii"); // magic
  header.write("00", 263, 2, "ascii"); // version

  // Checksum is computed with the checksum field filled with spaces.
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i]!;
  header.write(sum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header.write("\0 ", 154, 2, "ascii");

  // Body padded to a 512-byte boundary, then two zero blocks end the archive.
  const padded = Buffer.alloc(Math.ceil(content.length / 512) * 512, 0);
  content.copy(padded);

  return Buffer.concat([header, padded, Buffer.alloc(1024, 0)]);
}

/** Pull the single file's bytes out of a tar archive buffer. */
export function untarSingleFile(tar: Buffer): Buffer | null {
  if (tar.length < 512) return null;
  const sizeField = tar.toString("ascii", 124, 136).replace(/\0.*$/, "").trim();
  const size = parseInt(sizeField, 8);
  if (!Number.isFinite(size) || size <= 0) return null;
  return tar.subarray(512, 512 + size);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Resolve a container id, surfacing a 404 if the server is unknown. */
async function resolveContainer(event: H3Event, id: string) {
  const { getServer, docker } = useDocker(event);
  try {
    const server = await getServer(id);
    return docker.getContainer(server.id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
}

/** Write the (already processed) PNG into the server's `/data` directory. */
export async function writeServerIcon(event: H3Event, id: string, png: Buffer) {
  const container = await resolveContainer(event, id);
  await container.putArchive(tarSingleFile(ICON_FILE, png), { path: "/data" });
}

/** Read the current icon back, or `null` if none is set. */
export async function readServerIcon(event: H3Event, id: string) {
  const container = await resolveContainer(event, id);
  try {
    const stream = await container.getArchive({ path: ICON_PATH });
    return untarSingleFile(await streamToBuffer(stream as NodeJS.ReadableStream));
  } catch (error) {
    // 404 = the file does not exist yet.
    if ((error as { statusCode?: number }).statusCode === 404) return null;
    throw error;
  }
}

/** Remove the icon from the volume (requires a running container). */
export async function deleteServerIcon(event: H3Event, id: string) {
  const container = await resolveContainer(event, id);
  try {
    const exec = await container.exec({
      Cmd: ["rm", "-f", ICON_PATH],
      AttachStdout: false,
      AttachStderr: false,
    });
    await exec.start({});
  } catch (error) {
    // 409 = container is not running, so exec cannot run.
    if ((error as { statusCode?: number }).statusCode === 409) {
      throw createError({
        statusCode: 409,
        statusMessage: "Start the server to remove its icon",
      });
    }
    throw error;
  }
}
