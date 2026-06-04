import { pack, extract } from "tar-stream";
import { parse as parseYaml } from "yaml";

/**
 * Read/write access to a server's editable config files.
 *
 * Scope depends on the server type (see locations.ts):
 *   - plugin servers: plugins/**
 *   - mod servers:    config/** and <level>/serverconfig/** (Forge/NeoForge
 *                     per-world configs for the active world)
 *   - both:           root-level *.yml / *.yaml / *.toml (bukkit.yml, ...)
 * `server.properties` is never editable — itzg regenerates it from env vars on
 * every start, so edits there would be silently lost.
 *
 * Listing runs `find` in a short-lived helper container (cheap, works whether
 * or not the server is up). Reading and writing a single file use the Docker
 * archive API on the main container, which also works while stopped.
 *
 * Every client-supplied path goes through `safeRelPath`, so a request can only
 * touch the scoped roots above — never other world data, jars or itzg
 * internals.
 */

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — config files, not data dumps
const MAX_LIST_ENTRIES = 2000;
const MAX_FIND_DEPTH = 8;

export type ConfigFile = { path: string; size: number };

type ConfigScope = { roots: string[]; rootExts: readonly string[] };

function scopeFor(type?: string | null, level?: string | null): ConfigScope {
  return { roots: configRoots(type, level), rootExts: ROOT_CONFIG_EXTENSIONS };
}

/** Validate a client-supplied path and return it normalised (relative to /data). */
function safeRelPath(input: string, scope: ConfigScope): string {
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

  // Under one of the type's config roots (plugins/ or config/).
  if (scope.roots.some((root) => path.startsWith(`${root}/`))) return path;

  // Root-level server config (bukkit.yml, spigot.yml, *.toml, ...).
  const lower = path.toLowerCase();
  if (!path.includes("/") && scope.rootExts.some((ext) => lower.endsWith(ext))) {
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
      Binds: [`${server.volume}:/data:ro`],
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

/** List the editable config files for a server (relative paths + sizes). */
export async function listConfigFiles(
  id: string,
  type: string | null | undefined,
  level?: string | null
): Promise<ConfigFile[]> {
  const scope = scopeFor(type, level);
  if (!scope.roots.length) return [];

  // One find per config root (paths prefixed via -printf so no post-processing
  // is needed), plus one for the root-level extension allowlist. The target is
  // quoted so world names with spaces stay intact, and stderr is dropped so
  // missing directories just yield no output.
  const finds = scope.roots.map(
    (root) =>
      `find "/data/${root}" -maxdepth ${MAX_FIND_DEPTH} -type f -printf '%s\\t${root}/%P\\n' 2>/dev/null`
  );
  const rootNameTests = scope.rootExts
    .map((ext) => `-name '*${ext}'`)
    .join(" -o ");
  finds.push(
    `find /data -maxdepth 1 -type f \\( ${rootNameTests} \\) -printf '%s\\t%P\\n' 2>/dev/null`
  );

  const out = await runInVolume(
    id,
    `{ ${finds.join("; ")}; } | head -n ${MAX_LIST_ENTRIES}`
  );

  const files: ConfigFile[] = [];
  for (const line of out.split("\n")) {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed) continue;
    const tab = trimmed.indexOf("\t");
    if (tab === -1) continue;
    const size = Number(trimmed.slice(0, tab));
    const rel = trimmed.slice(tab + 1);
    if (!rel || rel === "server.properties") continue;
    // Jars belong to the jar manager, not the config editor; root-level
    // dotfiles are itzg internals (.rcon-cli.yaml even holds the RCON
    // password) and must never be listed.
    if (rel.toLowerCase().endsWith(".jar")) continue;
    if (basename(rel).startsWith(".")) continue;
    files.push({ path: rel, size: Number.isFinite(size) ? size : 0 });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
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
      entry.on("data", (chunk: Uint8Array) => {
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
  type: string | null | undefined,
  level: string | null | undefined,
  inputPath: string,
  content: string
): Promise<void> {
  const path = safeRelPath(inputPath, scopeFor(type, level));

  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
    });
  }

  validateContent(path, content);

  const { docker } = useDocker();
  const container = docker.getContainer(id);

  // Build the tar with the full relative path (including directory entries)
  // and extract it at /data — putArchive fails if the target directory
  // doesn't exist, and plugin config folders may not yet.
  const tar = pack();
  const segments = dirname(path).split("/").filter(Boolean);
  let parent = "";
  for (const segment of segments) {
    parent += `${segment}/`;
    tar.entry({ name: parent, type: "directory", mode: 0o755 });
  }
  tar.entry({ name: path, mode: 0o644 }, Buffer.from(content, "utf8"));
  tar.finalize();

  await container.putArchive(tar as unknown as NodeJS.ReadableStream, {
    path: "/data",
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
