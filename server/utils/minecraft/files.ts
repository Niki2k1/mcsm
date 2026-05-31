import { pack, extract } from "tar-stream";
import { parse as parseYaml } from "yaml";

/**
 * Read/write access to a server's config files, scoped to `/data/plugins`.
 *
 * Listing runs `find` in a short-lived helper container (cheap, works whether
 * or not the server is up, and avoids streaming a whole subtree just to get
 * names). Reading and writing a single file use the Docker archive API on the
 * main container, which is cheap for one file and also works while stopped.
 *
 * Everything is confined to `plugins/` and rejects path traversal, so a request
 * can never read or clobber files elsewhere in the volume (worlds, etc.).
 */

const ROOT = "plugins";
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — config files, not data dumps
const MAX_LIST_ENTRIES = 2000;
const MAX_FIND_DEPTH = 8;

export type ConfigFile = { path: string; size: number };

/** Validate a client-supplied path and return it normalised (relative to /data). */
function safeRelPath(input: string): string {
  const path = input.replace(/^\/+/, "");
  if (
    path !== ROOT &&
    !path.startsWith(`${ROOT}/`)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Path must be under plugins/",
    });
  }
  if (
    path.includes("..") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.endsWith("/")
  ) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }
  return path;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function dirname(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

/**
 * Run a read-only shell snippet in a throwaway container with the server's
 * volume mounted, returning its stdout. Used for the file listing.
 */
async function runInVolume(id: string, script: string): Promise<string> {
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
    Entrypoint: ["/bin/sh", "-c"],
    Cmd: [script],
    Tty: true, // un-multiplexed stdout, so logs() is plain text
    HostConfig: {
      Binds: [`${server.volume}:/data:ro`],
      NetworkMode: "none",
    },
  });

  try {
    await helper.start();
    await helper.wait();
    const buffer = (await helper.logs({
      stdout: true,
      stderr: false,
      follow: false,
    })) as unknown as Buffer;
    return buffer.toString("utf8");
  } finally {
    await helper.remove({ force: true }).catch(() => {});
  }
}

/** List the files under `/data/plugins` (relative paths + sizes). */
export async function listConfigFiles(id: string): Promise<ConfigFile[]> {
  // `%s` = size in bytes, `%P` = path relative to the find root. stderr is
  // dropped so a missing plugins dir just yields no output.
  const out = await runInVolume(
    id,
    `find /data/${ROOT} -maxdepth ${MAX_FIND_DEPTH} -type f -printf '%s\\t%P\\n' 2>/dev/null | head -n ${MAX_LIST_ENTRIES}`
  );

  const files: ConfigFile[] = [];
  for (const line of out.split("\n")) {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed) continue;
    const tab = trimmed.indexOf("\t");
    if (tab === -1) continue;
    const size = Number(trimmed.slice(0, tab));
    const rel = trimmed.slice(tab + 1);
    if (!rel) continue;
    files.push({ path: `${ROOT}/${rel}`, size: Number.isFinite(size) ? size : 0 });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Read a single config file as UTF-8 text. Rejects binary or oversized files. */
export async function readConfigFile(
  id: string,
  inputPath: string
): Promise<{ path: string; content: string }> {
  const path = safeRelPath(inputPath);
  const { docker } = useDocker();
  const container = docker.getContainer(id);

  let stream: NodeJS.ReadableStream;
  try {
    stream = await container.getArchive({ path: `/data/${path}` });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      throw createError({ statusCode: 404, statusMessage: "File not found" });
    }
    throw error;
  }

  const data = await new Promise<Buffer>((resolve, reject) => {
    const tar = extract();
    let found: Buffer | null = null;

    tar.on("entry", (header, entry, next) => {
      if (header.type !== "file") {
        entry.resume();
        return next();
      }
      const chunks: Buffer[] = [];
      let size = 0;
      entry.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_FILE_BYTES) {
          tar.destroy();
          reject(
            createError({
              statusCode: 413,
              statusMessage: `File too large to edit (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
            })
          );
          return;
        }
        chunks.push(chunk);
      });
      entry.on("end", () => {
        found = Buffer.concat(chunks);
        next();
      });
    });

    tar.on("finish", () => {
      if (!found) {
        reject(createError({ statusCode: 404, statusMessage: "File not found" }));
      } else {
        resolve(found);
      }
    });
    tar.on("error", reject);
    stream.on("error", reject);
    stream.pipe(tar);
  });

  // Reject binaries — a NUL byte is a reliable enough signal for config files.
  if (data.includes(0)) {
    throw createError({
      statusCode: 415,
      statusMessage: "File is not editable as text",
    });
  }

  return { path, content: data.toString("utf8") };
}

/**
 * Write a single config file. YAML/JSON content is validated first so a bad
 * edit is rejected before it can break the server.
 */
export async function writeConfigFile(
  id: string,
  inputPath: string,
  content: string
): Promise<void> {
  const path = safeRelPath(inputPath);

  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
    });
  }

  validateContent(path, content);

  const { docker } = useDocker();
  const container = docker.getContainer(id);

  const tar = pack();
  tar.entry({ name: basename(path), mode: 0o644 }, Buffer.from(content, "utf8"));
  tar.finalize();

  await container.putArchive(tar as unknown as NodeJS.ReadableStream, {
    path: `/data/${dirname(path)}`,
  });
}

/** Block saves that would write syntactically invalid YAML/JSON. */
function validateContent(path: string, content: string): void {
  const lower = path.toLowerCase();
  try {
    if (lower.endsWith(".yml") || lower.endsWith(".yaml")) {
      parseYaml(content);
    } else if (lower.endsWith(".json")) {
      JSON.parse(content);
    }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid syntax: ${(error as Error).message}`,
    });
  }
}
