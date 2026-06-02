import { createHash } from "node:crypto";
import MinecraftData from "minecraft-data";
import type { ServerConfig } from "../../schema/server.schema";

/**
 * Modrinth API client (https://docs.modrinth.com/api).
 *
 * Powers the in-app mod/plugin browser: search filtered to the server's
 * loader + Minecraft version, direct installs of the matching build, and
 * hash-based update checks (Modrinth identifies any uploaded jar by its
 * SHA-1, so even manually uploaded files get update detection).
 *
 * The API is public and unauthenticated; Modrinth asks for a descriptive
 * User-Agent and allows 300 requests/minute per IP.
 */

const API = "https://api.modrinth.com/v2";
const USER_AGENT = "mcsm (github.com/Niki2k1/mcsm)";
const REQUEST_TIMEOUT_MS = 10_000;
/** Same cap as manual jar uploads. */
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
/** Only ever download from Modrinth's own CDN. */
const ALLOWED_DOWNLOAD_HOST = "cdn.modrinth.com";

// ---------------------------------------------------------------------------
// Types (the subset of Modrinth's responses MCSM uses)
// ---------------------------------------------------------------------------

export type ModrinthSearchHit = {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  categories: string[];
  server_side: "required" | "optional" | "unsupported";
};

export type ModrinthVersionFile = {
  url: string;
  filename: string;
  size: number;
  primary: boolean;
  hashes: { sha1: string; sha512: string };
};

export type ModrinthDependency = {
  project_id: string | null;
  version_id: string | null;
  dependency_type: "required" | "optional" | "incompatible" | "embedded";
};

export type ModrinthVersion = {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  files: ModrinthVersionFile[];
  dependencies: ModrinthDependency[];
};

export type ModrinthProject = {
  id: string;
  slug: string;
  title: string;
  icon_url: string | null;
};

// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------

async function modrinthFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    query?: Record<string, string>;
  } = {}
): Promise<T> {
  try {
    // Cast: $fetch's generic narrows poorly with a dynamic method.
    return (await $fetch(`${API}${path}`, {
      method: options.method ?? "GET",
      query: options.query,
      body: options.body,
      headers: { "User-Agent": USER_AGENT },
      timeout: REQUEST_TIMEOUT_MS,
      retry: 0,
    })) as T;
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: "Project not found on Modrinth",
      });
    }
    console.error("[mcsm] Modrinth request failed:", path, error);
    throw createError({
      statusCode: 502,
      statusMessage:
        statusCode === 429
          ? "Modrinth rate limit reached — try again in a minute"
          : "Modrinth is unreachable",
    });
  }
}

// ---------------------------------------------------------------------------
// Loader / game version resolution
// ---------------------------------------------------------------------------

/**
 * The Modrinth loader facet for a server type. AUTO_CURSEFORGE resolves to
 * null — the modpack's loader must be detected from the volume (see
 * detectLoader in locations.ts) or chosen by the user.
 */
export function modrinthLoader(
  type: string | null | undefined
): "paper" | "fabric" | "forge" | null {
  switch (type) {
    case "PAPER":
      return "paper";
    case "FABRIC":
      return "fabric";
    case "FORGE":
      return "forge";
    default:
      return null;
  }
}

/**
 * The Minecraft version to match Modrinth builds against: the configured
 * version, or the latest release when the server runs "latest" (VERSION null).
 */
export function serverGameVersion(config: ServerConfig | null | undefined): string {
  if (config?.VERSION?.label) return config.VERSION.label;

  // Same "stable releases only" filter as /api/minecraft/versions, newest
  // first by protocol number (monotonic across releases).
  const versions = Object.values(MinecraftData.versionsByMinecraftVersion["pc"])
    .filter((version) => version.releaseType === "release")
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  return versions[0]?.minecraftVersion ?? "1.21.1";
}

/**
 * The Modrinth loader to use for a server: an explicit override (UI picker),
 * the type mapping, or — for CurseForge modpacks — detection from the volume.
 */
export async function resolveServerLoader(
  server: {
    id: string;
    volume?: string | null;
    config: ServerConfig | null;
  },
  override?: string | null
): Promise<string> {
  if (override) return override;

  const fromType = modrinthLoader(server.config?.type);
  if (fromType) return fromType;

  const detected = await detectLoader(server.id, server.volume);
  if (detected) return detected;

  throw createError({
    statusCode: 409,
    statusMessage:
      "Could not detect the modpack's mod loader — start the server once so the modpack installs, or pick a loader manually",
  });
}

// ---------------------------------------------------------------------------
// Search / versions / updates
// ---------------------------------------------------------------------------

export async function searchProjects(opts: {
  query: string;
  loader: string;
  gameVersion: string;
  offset?: number;
  limit?: number;
}): Promise<{ hits: ModrinthSearchHit[]; total: number }> {
  // Facets: outer arrays are AND-ed, inner entries OR-ed. server_side filter
  // keeps client-only mods (shaders, minimaps) out of a *server* manager.
  const facets = JSON.stringify([
    [`categories:${opts.loader}`],
    [`versions:${opts.gameVersion}`],
    ["server_side:optional", "server_side:required"],
  ]);

  const response = await modrinthFetch<{
    hits: ModrinthSearchHit[];
    total_hits: number;
  }>("/search", {
    query: {
      query: opts.query,
      facets,
      limit: String(opts.limit ?? 20),
      offset: String(opts.offset ?? 0),
      index: "relevance",
    },
  });

  return { hits: response.hits, total: response.total_hits };
}

/** Newest version of a project compatible with the loader + game version. */
export async function findCompatibleVersion(
  idOrSlug: string,
  loader: string,
  gameVersion: string
): Promise<ModrinthVersion | null> {
  const versions = await modrinthFetch<ModrinthVersion[]>(
    `/project/${encodeURIComponent(idOrSlug)}/version`,
    {
      query: {
        loaders: JSON.stringify([loader]),
        game_versions: JSON.stringify([gameVersion]),
      },
    }
  );
  return versions[0] ?? null;
}

export async function getProject(idOrSlug: string): Promise<ModrinthProject> {
  return modrinthFetch<ModrinthProject>(
    `/project/${encodeURIComponent(idOrSlug)}`
  );
}

/**
 * Recursively resolve a version's *required* dependencies into installable
 * versions. Cycle-guarded and depth-limited; optional dependencies are
 * ignored.
 */
export async function resolveRequiredDeps(
  version: ModrinthVersion,
  loader: string,
  gameVersion: string,
  seen: Set<string> = new Set([version.project_id]),
  depth = 0
): Promise<ModrinthVersion[]> {
  if (depth >= 3) return [];

  const required = version.dependencies.filter(
    (dep) => dep.dependency_type === "required" && dep.project_id
  );

  const resolved: ModrinthVersion[] = [];
  for (const dep of required) {
    if (seen.has(dep.project_id!)) continue;
    seen.add(dep.project_id!);

    const depVersion = await findCompatibleVersion(
      dep.project_id!,
      loader,
      gameVersion
    );
    if (!depVersion) {
      // A required dependency with no compatible build — surface clearly
      // rather than installing a mod that will crash the server.
      const project = await getProject(dep.project_id!).catch(() => null);
      throw createError({
        statusCode: 409,
        statusMessage: `Required dependency "${project?.title ?? dep.project_id}" has no build for ${loader} ${gameVersion}`,
      });
    }

    resolved.push(depVersion);
    resolved.push(
      ...(await resolveRequiredDeps(depVersion, loader, gameVersion, seen, depth + 1))
    );
  }

  return resolved;
}

/**
 * Hash-based update check: maps each installed jar's SHA-1 to the latest
 * compatible version of its project. Hashes Modrinth doesn't recognize
 * (custom/private jars) are simply absent from the result.
 */
export async function checkUpdates(
  sha1s: string[],
  loader: string,
  gameVersion: string
): Promise<Record<string, ModrinthVersion>> {
  if (!sha1s.length) return {};
  return modrinthFetch<Record<string, ModrinthVersion>>(
    "/version_files/update",
    {
      method: "POST",
      body: {
        hashes: sha1s,
        algorithm: "sha1",
        loaders: [loader],
        game_versions: [gameVersion],
      },
    }
  );
}

/**
 * Identify which projects a set of jar hashes belong to (current versions,
 * no loader/version filter). Used to mark already-installed projects in
 * search results and to detect MODRINTH_PROJECTS-managed jars.
 */
export async function identifyHashes(
  sha1s: string[]
): Promise<Record<string, ModrinthVersion>> {
  if (!sha1s.length) return {};
  return modrinthFetch<Record<string, ModrinthVersion>>("/version_files", {
    method: "POST",
    body: { hashes: sha1s, algorithm: "sha1" },
  });
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

/**
 * Download a version's primary jar from Modrinth's CDN, enforcing the size
 * cap and verifying the SHA-1 against what the API declared.
 */
export async function downloadVersionJar(
  version: ModrinthVersion
): Promise<{ name: string; data: Uint8Array }> {
  const file = version.files.find((f) => f.primary) ?? version.files[0];
  if (!file) {
    throw createError({
      statusCode: 502,
      statusMessage: "Modrinth version has no downloadable file",
    });
  }

  // Never follow download URLs to anything but Modrinth's own CDN.
  const url = new URL(file.url);
  if (url.hostname !== ALLOWED_DOWNLOAD_HOST) {
    throw createError({
      statusCode: 502,
      statusMessage: "Unexpected download host from Modrinth",
    });
  }
  if (file.size > MAX_DOWNLOAD_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `"${file.filename}" is too large (max ${MAX_DOWNLOAD_BYTES / 1024 / 1024} MB)`,
    });
  }

  let data: ArrayBuffer;
  try {
    data = await $fetch<ArrayBuffer>(file.url, {
      responseType: "arrayBuffer",
      headers: { "User-Agent": USER_AGENT },
      timeout: 60_000,
      retry: 0,
    });
  } catch (error) {
    console.error("[mcsm] Modrinth download failed:", file.url, error);
    throw createError({
      statusCode: 502,
      statusMessage: `Could not download "${file.filename}" from Modrinth`,
    });
  }

  const bytes = new Uint8Array(data);
  if (bytes.length > MAX_DOWNLOAD_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `"${file.filename}" is too large`,
    });
  }

  // Verify integrity against the hash Modrinth declared for this file.
  const sha1 = createHash("sha1").update(bytes).digest("hex");
  if (sha1 !== file.hashes.sha1) {
    throw createError({
      statusCode: 502,
      statusMessage: `Downloaded "${file.filename}" failed integrity verification`,
    });
  }

  return { name: file.filename, data: bytes };
}
