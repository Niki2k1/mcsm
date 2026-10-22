import type { Readable } from "node:stream";
import type { H3Event } from "h3";
import { pack, extract } from "tar-stream";
import { parse as parseYaml } from "yaml";

/**
 * File manager access to a server's volume.
 *
 * Scope depends on the server type (see locations.ts):
 *   - plugin servers: plugins/**
 *   - mod servers:    config/** and <level>/serverconfig/** (Forge/NeoForge
 *                     per-world configs for the active world)
 *   - both:           <level>/datapacks/** and root-level *.yml / *.yaml /
 *                     *.toml files (bukkit.yml, ...)
 * `server.properties` is never editable — itzg regenerates it from env vars on
 * every start, so edits there would be silently lost.
 *
 * Listing, deleting and moving run in short-lived helper containers (works
 * whether or not the server is up; the socket proxy has no EXEC). Reading and
 * writing use the Docker archive API on the main container, which also works
 * while stopped.
 *
 * Every client-supplied path goes through `safeRelPath`, so a request can only
 * touch the scoped roots above — never other world data, jars or itzg
 * internals.
 */

const MAX_TEXT_BYTES = 2 * 1024 * 1024; // 2 MB — the editor is for configs, not data dumps
const MAX_LIST_ENTRIES = 2000;
const MAX_FIND_DEPTH = 8;

export type FileEntry = { path: string; size: number; type: "file" | "dir" };

type ConfigScope = { roots: string[]; rootExts: readonly string[] };

function scopeFor(type?: string | null, level?: string | null): ConfigScope {
  return { roots: configRoots(type, level), rootExts: ROOT_CONFIG_EXTENSIONS };
}

/**
 * Validate a client-supplied path and return it normalised (relative to
 * /data). Anything below a scope root passes; "file" paths may also sit
 * directly in /data when their extension is on the root allowlist, and a
 * "parent" may be a scope root itself (upload target). Roots themselves can
 * never be deleted, moved or recreated.
 */
function safeRelPath(
  input: string,
  scope: ConfigScope,
  kind: "file" | "dir" | "parent" = "file"
): string {
  const path = input.replace(/^\/+/, "");

  if (
    !path ||
    path.includes("..") ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.endsWith("/")
  ) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }

  // Managed by MCSM/itzg — regenerated from env vars on every start.
  if (path === "server.properties") {
    throw createError({
      statusCode: 400,
      statusMessage:
        "server.properties is managed by MCSM — edit it in the Configuration tab",
    });
  }

  // Dotfiles are itzg internals (e.g. .rcon-cli.yaml holds the RCON password).
  if (path.split("/").some((segment) => segment.startsWith("."))) {
    throw createError({ statusCode: 400, statusMessage: "Invalid path" });
  }

  // Jars belong to the jar manager, not the config editor.
  if (path.toLowerCase().endsWith(".jar")) {
    throw createError({
      statusCode: 400,
      statusMessage: "Jar files are managed in the Plugins/Mods list",
    });
  }

  // Under one of the type's roots (plugins/, config/, datapacks/, ...).
  if (scope.roots.some((root) => path.startsWith(`${root}/`))) return path;
  if (kind === "parent" && scope.roots.includes(path)) return path;

  // Root-level server config (bukkit.yml, spigot.yml, *.toml, ...).
  const lower = path.toLowerCase();
  if (
    kind === "file" &&
    !path.includes("/") &&
    scope.rootExts.some((ext) => lower.endsWith(ext))
  ) {
    return path;
  }

  throw createError({
    statusCode: 400,
    statusMessage: "Path is outside the editable config locations",
  });
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
 * volume mounted, returning its stdout. Used for the file listing, jar
 * hashing (jars.ts) and modpack loader detection (locations.ts).
 */
export async function runInVolume(id: string, script: string): Promise<string> {
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
      Binds: [`${server.volumeSource}:/data:ro`],
      NetworkMode: "none",
    },
    Labels: { "mcsm.helper": "true" },
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

/**
 * List everything the file manager may show: the scope roots, plus every file
 * and folder beneath them (relative paths, sizes for files).
 */
export async function listFiles(
  id: string,
  type: string | null | undefined,
  level?: string | null
): Promise<{ roots: string[]; entries: FileEntry[]; truncated: boolean }> {
  const scope = scopeFor(type, level);
  if (!scope.roots.length) return { roots: [], entries: [], truncated: false };

  // One find per root (paths prefixed via -printf so no post-processing is
  // needed), plus one for the root-level extension allowlist. Roots are fixed
  // names or a world name checked against SAFE_LEVEL, so they are safe to
  // interpolate; stderr is dropped so missing directories just yield nothing.
  const finds = scope.roots.map(
    (root) =>
      `find "/data/${root}" -mindepth 1 -maxdepth ${MAX_FIND_DEPTH} \\( -type d -printf 'd\\t0\\t${root}/%P\\n' -o -type f -printf 'f\\t%s\\t${root}/%P\\n' \\) 2>/dev/null`
  );
  const rootNameTests = scope.rootExts
    .map((ext) => `-name '*${ext}'`)
    .join(" -o ");
  finds.push(
    `find /data -maxdepth 1 -type f \\( ${rootNameTests} \\) -printf 'f\\t%s\\t%P\\n' 2>/dev/null`
  );

  // One line past the cap tells us the listing was cut off.
  const out = await runInVolume(
    id,
    `{ ${finds.join("; ")}; } | head -n ${MAX_LIST_ENTRIES + 1}`
  );

  const lines = out.split("\n").map((line) => line.replace(/\r$/, ""));
  const truncated = lines.filter(Boolean).length > MAX_LIST_ENTRIES;

  const entries: FileEntry[] = [];
  for (const line of lines.slice(0, MAX_LIST_ENTRIES)) {
    const [kind, rawSize, rel] = line.split("\t");
    if (!rel || rel === "server.properties") continue;
    // Dotfiles/dot-folders are itzg internals (.rcon-cli.yaml even holds the
    // RCON password); jars belong to the jar manager.
    if (rel.split("/").some((segment) => segment.startsWith("."))) continue;
    if (kind === "f" && rel.toLowerCase().endsWith(".jar")) continue;
    const size = Number(rawSize);
    entries.push({
      path: rel,
      size: Number.isFinite(size) ? size : 0,
      type: kind === "d" ? "dir" : "file",
    });
  }

  entries.sort((x, y) => x.path.localeCompare(y.path));
  return { roots: scope.roots, entries, truncated };
}

/** Read a single config file as UTF-8 text. Rejects binary or oversized files. */
export async function readConfigFile(
  id: string,
  type: string | null | undefined,
  level: string | null | undefined,
  inputPath: string
): Promise<{ path: string; content: string }> {
  const path = safeRelPath(inputPath, scopeFor(type, level));
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
      const chunks: Uint8Array[] = [];
      let size = 0;
      entry.on("data", (raw) => {
        const chunk = raw as Uint8Array;
        size += chunk.length;
        if (size > MAX_TEXT_BYTES) {
          tar.destroy();
          reject(
            createError({
              statusCode: 413,
              statusMessage: `File too large to edit (max ${MAX_TEXT_BYTES / 1024 / 1024} MB)`,
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
        reject(
          createError({ statusCode: 404, statusMessage: "File not found" })
        );
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
  type: string | null | undefined,
  level: string | null | undefined,
  inputPath: string,
  content: string
): Promise<void> {
  const path = safeRelPath(inputPath, scopeFor(type, level));

  if (Buffer.byteLength(content, "utf8") > MAX_TEXT_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `File too large (max ${MAX_TEXT_BYTES / 1024 / 1024} MB)`,
    });
  }

  validateContent(path, content);
  await putEntries(id, [{ path, data: Buffer.from(content, "utf8") }]);
}

/**
 * Push files (and the folders leading to them) into /data in one archive.
 * Missing parent folders are created, since putArchive fails when the target
 * directory doesn't exist yet.
 */
async function putEntries(
  id: string,
  files: { path: string; data: Buffer }[],
  folders: string[] = []
): Promise<void> {
  const { docker } = useDocker();
  const container = docker.getContainer(id);
  // Own every entry as the server's runtime user. Without this the tar's
  // directory entries (e.g. `<level>/` for a per-world config) re-own the
  // existing world folder to root, and the running server can no longer save
  // it — "Failed to save level: Permission denied".
  const { uid, gid } = await containerOwner(container);

  const dirs = new Set<string>();
  const addParents = (path: string) => {
    const segments = path.split("/").filter(Boolean);
    let parent = "";
    for (const segment of segments) {
      parent += `${segment}/`;
      dirs.add(parent);
    }
  };
  for (const file of files) addParents(dirname(file.path));
  for (const folder of folders) addParents(folder);

  const tar = pack();
  for (const dir of [...dirs].sort()) {
    tar.entry({ name: dir, type: "directory", mode: 0o755, uid, gid });
  }
  for (const file of files) {
    tar.entry({ name: file.path, mode: 0o644, uid, gid }, file.data);
  }
  tar.finalize();

  await container.putArchive(tar as unknown as NodeJS.ReadableStream, {
    path: "/data",
  });
}

/**
 * Stream a single file out of the volume (any content, any size), for
 * downloads. Folders are rejected.
 */
export async function openFileDownload(
  id: string,
  type: string | null | undefined,
  level: string | null | undefined,
  inputPath: string
): Promise<{ filename: string; size: number; stream: Readable }> {
  const path = safeRelPath(inputPath, scopeFor(type, level));
  const { docker } = useDocker();

  let archive: NodeJS.ReadableStream;
  try {
    archive = await docker
      .getContainer(id)
      .getArchive({ path: `/data/${path}` });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      throw createError({ statusCode: 404, statusMessage: "File not found" });
    }
    throw error;
  }

  return new Promise((resolve, reject) => {
    const tar = extract();
    let settled = false;

    tar.on("entry", (header, entry, next) => {
      if (settled) {
        entry.resume();
        return next();
      }
      settled = true;
      if (header.type !== "file") {
        entry.resume();
        next();
        reject(createError({ statusCode: 400, statusMessage: "Not a file" }));
        return;
      }
      entry.on("end", next);
      resolve({
        filename: basename(path),
        size: header.size ?? 0,
        // tar-stream entries are streamx Readables; they pipe like Node's.
        stream: entry as unknown as Readable,
      });
    });

    tar.on("finish", () => {
      if (!settled) {
        reject(
          createError({ statusCode: 404, statusMessage: "File not found" })
        );
      }
    });
    tar.on("error", reject);
    archive.on("error", reject);
    archive.pipe(tar);
  });
}

/**
 * Upload files into a folder (a scope root or anything below it). Returns the
 * written paths. Existing files are overwritten — the UI confirms that first.
 */
export async function uploadFiles(
  id: string,
  type: string | null | undefined,
  level: string | null | undefined,
  inputDir: string,
  uploads: { filename: string; data: Buffer }[]
): Promise<string[]> {
  const scope = scopeFor(type, level);
  const dir = safeRelPath(inputDir, scope, "parent");

  const files = uploads.map((upload) => {
    // Browsers send bare names, but nothing stops a client from sending a path.
    const name = basename(upload.filename.replaceAll("\\", "/"));
    const path = safeRelPath(`${dir}/${name}`, scope);
    if (path.toLowerCase().match(/\.(ya?ml|json)$/)) {
      validateContent(path, upload.data.toString("utf8"));
    }
    return { path, data: upload.data };
  });

  await putEntries(id, files);
  return files.map((file) => file.path);
}

/** Create a folder (and any missing parents). */
export async function createFolder(
  id: string,
  type: string | null | undefined,
  level: string | null | undefined,
  inputPath: string
): Promise<string> {
  const path = safeRelPath(inputPath, scopeFor(type, level), "dir");
  await putEntries(id, [], [path]);
  return path;
}

/** Delete a file or a folder with everything in it. */
export async function deleteEntry(
  id: string,
  type: string | null | undefined,
  level: string | null | undefined,
  inputPath: string
): Promise<string> {
  const path = safeRelPath(inputPath, scopeFor(type, level));
  const { exitCode, output } = await runWriteHelper(id, [
    "rm",
    "-rf",
    "--",
    `/data/${path}`,
  ]);
  if (exitCode !== 0) {
    console.error("[mcsm] Delete helper failed:", output);
    throw createError({ statusCode: 500, statusMessage: "Failed to delete" });
  }
  return path;
}

/**
 * Rename or move a file/folder. The target's folder must already exist and
 * the target itself must not, so a move never silently replaces data.
 */
export async function moveEntry(
  id: string,
  type: string | null | undefined,
  level: string | null | undefined,
  inputFrom: string,
  inputTo: string
): Promise<{ from: string; to: string }> {
  const scope = scopeFor(type, level);
  const from = safeRelPath(inputFrom, scope);
  const to = safeRelPath(inputTo, scope);
  if (from === to) return { from, to };
  if (to.startsWith(`${from}/`)) {
    throw createError({
      statusCode: 400,
      statusMessage: "A folder can't be moved into itself",
    });
  }

  // Paths arrive as positional parameters, never inside the script text.
  const { exitCode, output } = await runWriteHelper(id, [
    "sh",
    "-c",
    '[ -e "$1" ] || exit 10; [ -e "$2" ] && exit 11; ' +
      '[ -d "$(dirname -- "$2")" ] || exit 12; mv -T -- "$1" "$2"',
    "sh",
    `/data/${from}`,
    `/data/${to}`,
  ]);

  if (exitCode === 10) {
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  }
  if (exitCode === 11) {
    throw createError({
      statusCode: 409,
      statusMessage: "A file or folder with that name already exists",
    });
  }
  if (exitCode === 12) {
    throw createError({
      statusCode: 400,
      statusMessage: "The target folder doesn't exist",
    });
  }
  if (exitCode !== 0) {
    console.error("[mcsm] Move helper failed:", output);
    throw createError({ statusCode: 500, statusMessage: "Failed to move" });
  }
  return { from, to };
}

/**
 * Run a command (argv, no shell unless the command is one) in a throwaway
 * container with the server's volume mounted read-write.
 */
async function runWriteHelper(
  id: string,
  argv: string[]
): Promise<{ exitCode: number; output: string }> {
  const { docker, getServer } = useDocker();
  const config = useRuntimeConfig();

  const server = await getServer(id);
  if (!server.volume) {
    throw createError({
      statusCode: 409,
      statusMessage: "Server has no data volume",
    });
  }

  const [entrypoint, ...args] = argv;
  const helper = await docker.createContainer({
    Image: config.docker?.image || "itzg/minecraft-server",
    Entrypoint: [entrypoint!],
    Cmd: args,
    Tty: true, // un-multiplexed output, so logs() is plain text
    HostConfig: {
      Binds: [`${server.volumeSource}:/data`],
      NetworkMode: "none",
    },
    Labels: { "mcsm.helper": "true" },
  });

  try {
    await helper.start();
    const result = await helper.wait();
    const logs = (await helper.logs({
      stdout: true,
      stderr: true,
      follow: false,
    })) as unknown as Buffer;
    return { exitCode: result.StatusCode, output: logs.toString("utf8") };
  } finally {
    await helper.remove({ force: true }).catch(() => {});
  }
}

/**
 * Resolve the server behind a file manager request, or fail with the right
 * status: 404 when it doesn't exist, 400 when its type has no editable files.
 */
export async function getFileManagerServer(event: H3Event, id: string) {
  const { getServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!serverTypeSupportsJars(server.config?.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: "This server type does not support file editing",
    });
  }
  return server;
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
