import { z } from "zod";

/**
 * Hash-based update check for a server's installed jars.
 *
 * Every jar is SHA-1 hashed (one helper-container run) and looked up on
 * Modrinth: recognized jars get their project identity, and those with a
 * newer compatible build get update info. Jars managed by the itzg
 * auto-install (MODRINTH_PROJECTS — e.g. Chunky/BlueMap) are flagged so the
 * UI doesn't offer manual updates that would be overwritten on the next boot.
 *
 * Responses are cached per volume for 10 minutes (?refresh=true busts it) to
 * stay well inside Modrinth's rate limit.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;

type UpdatesResponse = {
  loader: string;
  gameVersion: string;
  /** Modrinth project id per recognized jar filename. */
  projects: Record<string, { projectId: string; managed: boolean }>;
  /** Jars with a newer compatible build available. */
  updates: {
    filename: string;
    projectId: string;
    currentSha1: string;
    latestVersion: string;
    latestFilename: string;
    managed: boolean;
  }[];
};

const cache = new Map<string, { at: number; data: UpdatesResponse }>();

export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { refresh, loader } = await useValidatedQuery(event, {
    refresh: z.enum(["true", "false"]).default("false"),
    loader: z.enum(["paper", "fabric", "forge", "neoforge"]).optional(),
  });

  const { getServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const dir = jarsDir(server.config?.type);
  if (!dir) {
    throw createError({
      statusCode: 400,
      statusMessage: "This server type does not support mods or plugins",
    });
  }

  const volume = server.volume ?? id;
  const cached = cache.get(volume);
  if (refresh !== "true" && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const resolvedLoader = await resolveServerLoader(server, loader);
  const gameVersion = serverGameVersion(server.config);

  // Hash every installed jar in one helper run, then ask Modrinth about them.
  const hashes = await jarHashes(id, dir);
  const filenames = Object.keys(hashes);
  const sha1s = Object.values(hashes);

  const [identified, latest] = await Promise.all([
    identifyHashes(sha1s),
    checkUpdates(sha1s, resolvedLoader, gameVersion),
  ]);

  // Projects installed via the itzg auto-install env are synced by the image
  // on every boot — manual updates to them would be silently reverted.
  const managedSlugs = parseModrinthProjects(
    server.config?.MODRINTH_PROJECTS
  ).map((token) => token.split(":")[0]!.toLowerCase());
  const managedProjectIds = new Set<string>();
  for (const slug of managedSlugs) {
    const project = await getProject(slug).catch(() => null);
    if (project) managedProjectIds.add(project.id);
  }

  const projects: UpdatesResponse["projects"] = {};
  const updates: UpdatesResponse["updates"] = [];

  for (const filename of filenames) {
    const sha1 = hashes[filename]!;
    const current = identified[sha1];
    if (!current) continue; // not on Modrinth (custom/private jar)

    const managed = managedProjectIds.has(current.project_id);
    projects[filename] = { projectId: current.project_id, managed };

    const newest = latest[sha1];
    if (!newest) continue;

    // An update exists when the newest compatible build's primary file
    // differs from what's installed.
    const newestFile =
      newest.files.find((file) => file.primary) ?? newest.files[0];
    if (!newestFile || newestFile.hashes.sha1 === sha1) continue;

    updates.push({
      filename,
      projectId: current.project_id,
      currentSha1: sha1,
      latestVersion: newest.version_number,
      latestFilename: newestFile.filename,
      managed,
    });
  }

  const data: UpdatesResponse = {
    loader: resolvedLoader,
    gameVersion,
    projects,
    updates,
  };
  cache.set(volume, { at: Date.now(), data });
  return data;
});
