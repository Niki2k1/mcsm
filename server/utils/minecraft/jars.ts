import { pack, extract } from "tar-stream";
import { unzipSync, type UnzipFileInfo } from "fflate";

/**
 * Mod/plugin jar management.
 *
 * Jars live in the server's /data/plugins (Paper) or /data/mods (mod loaders)
 * directory, which is backed by the named volume. The app talks to Docker (not
 * the filesystem), so we read the directory with `getArchive`, write new jars
 * with `putArchive`, and delete via a short-lived helper container that mounts
 * the same volume.
 *
 * Uploads may be raw `.jar` files or `.zip` bundles; we only ever extract the
 * `.jar` entries out of a zip. Because zips are attacker-controllable, the
 * extraction is hardened against zip bombs (see `extractJars`).
 */

// Zip-bomb / abuse guards. These bound work *before* and *during* extraction:
//   - the HTTP layer caps the compressed upload size (see the POST handler),
//   - MAX_ENTRIES caps how many members a single zip may declare,
//   - MAX_FILE_BYTES / MAX_TOTAL_BYTES cap the decompressed size, and
//   - MAX_RATIO rejects absurd compression ratios (the classic bomb signature).
// fflate's `filter` runs per entry *before* that entry is inflated, so a
// flagged member is skipped/aborted rather than expanded into memory.
const MAX_ENTRIES = 512;
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB per extracted jar
const MAX_TOTAL_BYTES = 300 * 1024 * 1024; // 300 MB extracted across a zip
const MAX_RATIO = 200; // uncompressed:compressed

/** Thrown for malformed or unsafe uploads; surfaced to the client as a 400. */
export class JarUploadError extends Error {}

export type JarInfo = { name: string; size: number };
export type UploadedFile = { filename: string; data: Buffer };
export type JarFile = { name: string; data: Uint8Array };

/** Strip any directory components, leaving a bare file name. */
function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * List the `.jar` files in /data/<dir>. Works whether or not the container is
 * running (it reads the filesystem layer, not a live process). Returns an
 * empty list if the directory doesn't exist yet.
 */
export async function listJars(id: string, dir: string): Promise<JarInfo[]> {
  const { docker } = useDocker();
  const container = docker.getContainer(id);

  let stream: NodeJS.ReadableStream;
  try {
    stream = await container.getArchive({ path: `/data/${dir}` });
  } catch (error) {
    // 404 = the directory hasn't been created yet.
    if ((error as { statusCode?: number }).statusCode === 404) return [];
    throw error;
  }

  return new Promise<JarInfo[]>((resolve, reject) => {
    const files: JarInfo[] = [];
    const tar = extract();

    tar.on("entry", (header, entry, next) => {
      const name = basename(header.name);
      if (header.type === "file" && name.toLowerCase().endsWith(".jar")) {
        files.push({ name, size: header.size ?? 0 });
      }
      entry.on("end", next);
      entry.resume(); // drain; we only need the headers
    });

    tar.on("finish", () =>
      resolve(files.sort((a, b) => a.name.localeCompare(b.name)))
    );
    tar.on("error", reject);
    stream.on("error", reject);
    stream.pipe(tar);
  });
}

/**
 * Pull the `.jar` files out of an upload. `.jar` uploads pass through; `.zip`
 * uploads are unpacked and only their `.jar` members are kept. Directory
 * components in entry names are discarded, so zip-slip path traversal can't
 * escape the target directory.
 */
export function extractJars(uploads: UploadedFile[]): JarFile[] {
  const jars: JarFile[] = [];

  for (const upload of uploads) {
    const lower = upload.filename.toLowerCase();

    if (lower.endsWith(".jar")) {
      if (upload.data.length > MAX_FILE_BYTES) {
        throw new JarUploadError(
          `"${basename(upload.filename)}" is too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB).`
        );
      }
      jars.push({
        name: basename(upload.filename),
        data: new Uint8Array(upload.data),
      });
      continue;
    }

    if (!lower.endsWith(".zip")) {
      throw new JarUploadError(
        `Unsupported file "${basename(upload.filename)}". Upload .jar or .zip files.`
      );
    }

    jars.push(...extractZip(upload));
  }

  return jars;
}

/** Unpack a single zip into its `.jar` members, enforcing the bomb guards. */
function extractZip(upload: UploadedFile): JarFile[] {
  let entries = 0;
  let declaredTotal = 0;

  const filter = (file: UnzipFileInfo): boolean => {
    if (++entries > MAX_ENTRIES) {
      throw new JarUploadError(
        `"${basename(upload.filename)}" has too many entries (max ${MAX_ENTRIES}).`
      );
    }

    // Skip directories and non-jar members without decompressing them.
    if (file.name.endsWith("/") || !file.name.toLowerCase().endsWith(".jar")) {
      return false;
    }

    if (file.originalSize > MAX_FILE_BYTES) {
      throw new JarUploadError(
        `"${basename(file.name)}" is too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB).`
      );
    }
    // `size` is the compressed size; a huge expansion ratio is the hallmark of
    // a zip bomb.
    if (file.size > 0 && file.originalSize / file.size > MAX_RATIO) {
      throw new JarUploadError(
        `"${basename(upload.filename)}" looks like a zip bomb (compression ratio too high).`
      );
    }

    declaredTotal += file.originalSize;
    if (declaredTotal > MAX_TOTAL_BYTES) {
      throw new JarUploadError(
        `"${basename(upload.filename)}" decompresses too large (max ${MAX_TOTAL_BYTES / 1024 / 1024} MB).`
      );
    }

    return true;
  };

  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(new Uint8Array(upload.data), { filter });
  } catch (error) {
    if (error instanceof JarUploadError) throw error;
    throw new JarUploadError(
      `Could not read "${basename(upload.filename)}" as a zip archive.`
    );
  }

  // Belt-and-suspenders: re-check the *actual* decompressed bytes in case a
  // crafted header under-reported the original size in the filter above.
  const jars: JarFile[] = [];
  let actualTotal = 0;
  for (const [name, data] of Object.entries(unpacked)) {
    actualTotal += data.length;
    if (data.length > MAX_FILE_BYTES || actualTotal > MAX_TOTAL_BYTES) {
      throw new JarUploadError(
        `"${basename(upload.filename)}" decompresses too large (max ${MAX_TOTAL_BYTES / 1024 / 1024} MB).`
      );
    }
    jars.push({ name: basename(name), data });
  }

  return jars;
}

/**
 * Write jars into /data/<dir> by streaming a tar into the container. The
 * directory entry ensures the path exists on a freshly created server that has
 * never started. Works on stopped containers too.
 */
export async function writeJars(
  id: string,
  dir: string,
  jars: JarFile[]
): Promise<void> {
  const { docker } = useDocker();
  const container = docker.getContainer(id);
  // Own the jars (and the dir entry) as the server's runtime user so the
  // directory entry doesn't re-own an existing plugins/mods folder to root.
  const { uid, gid } = await containerOwner(container);

  const tar = pack();
  tar.entry({ name: `${dir}/`, type: "directory", mode: 0o755, uid, gid });
  for (const jar of jars) {
    tar.entry(
      { name: `${dir}/${jar.name}`, mode: 0o644, uid, gid },
      Buffer.from(jar.data)
    );
  }
  tar.finalize();

  await container.putArchive(tar as unknown as NodeJS.ReadableStream, {
    path: "/data",
  });
}

/**
 * Read a single jar's bytes (for downloads). Streams the file out of the
 * container via the archive API.
 */
export async function readJar(
  id: string,
  dir: string,
  name: string
): Promise<Buffer> {
  const { docker } = useDocker();
  const container = docker.getContainer(id);

  let stream: NodeJS.ReadableStream;
  try {
    stream = await container.getArchive({ path: `/data/${dir}/${name}` });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      throw createError({ statusCode: 404, statusMessage: "Jar not found" });
    }
    throw error;
  }

  return new Promise<Buffer>((resolve, reject) => {
    const tar = extract();
    let found: Buffer | null = null;

    tar.on("entry", (header, entry, next) => {
      if (header.type !== "file") {
        entry.resume();
        return next();
      }
      const chunks: Uint8Array[] = [];
      entry.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      entry.on("end", () => {
        found = Buffer.concat(chunks);
        next();
      });
    });

    tar.on("finish", () => {
      if (!found) {
        reject(createError({ statusCode: 404, statusMessage: "Jar not found" }));
      } else {
        resolve(found);
      }
    });
    tar.on("error", reject);
    stream.on("error", reject);
    stream.pipe(tar);
  });
}

/**
 * SHA-1 of every jar in /data/<dir>, keyed by filename. One helper-container
 * run hashes them all — used for Modrinth's hash-based update detection.
 */
export async function jarHashes(
  id: string,
  dir: string
): Promise<Record<string, string>> {
  // `sha1sum` output: "<hash>  <path>" per line. Missing dir → no output.
  const out = await runInVolume(
    id,
    `cd /data/${dir} 2>/dev/null && sha1sum -- *.jar 2>/dev/null`
  );

  const hashes: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const match = /^([0-9a-f]{40})\s+\*?(.+?)\r?$/.exec(line.trim());
    if (!match) continue;
    hashes[match[2]!] = match[1]!;
  }
  return hashes;
}

/**
 * Delete a single jar. The main container may be running (and holding the jar
 * open), so we mount the same volume into a throwaway helper that runs `rm`.
 * `name` is passed as a bare argv element — no shell — and is validated by the
 * route handler.
 */
export async function deleteJar(
  id: string,
  dir: string,
  name: string
): Promise<void> {
  const { docker, getServer } = useDocker();
  const config = useRuntimeConfig();

  const server = await getServer(id);
  if (!server.volume) {
    throw createError({
      statusCode: 409,
      statusMessage: "Server has no data volume",
    });
  }

  const image = config.docker?.image || "itzg/minecraft-server";
  const helper = await docker.createContainer({
    Image: image,
    Entrypoint: ["/bin/rm"],
    Cmd: ["-f", `/data/${dir}/${name}`],
    HostConfig: {
      Binds: [`${server.volume}:/data`],
      NetworkMode: "none",
    },
    Labels: { "mcsm.helper": "true" },
  });

  try {
    await helper.start();
    await helper.wait();
  } finally {
    await helper.remove({ force: true }).catch(() => {});
  }
}
