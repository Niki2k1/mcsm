import { z } from "zod";

/**
 * Update installed jars to their latest Modrinth builds: download the new
 * file, remove the old one (filenames usually change across versions), and
 * restart once at the end if requested.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { filenames, loader, restart } = await useValidatedBody(event, {
    filenames: z.array(z.string().regex(/^[^/\\]+\.jar$/i)).min(1).max(100),
    loader: z.enum(["paper", "fabric", "forge", "neoforge"]).optional(),
    restart: z.boolean().default(true),
  });

  const { getServer, restartServer } = useDocker(event);
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

  const resolvedLoader = await resolveServerLoader(server, loader);
  const gameVersion = serverGameVersion(server.config);

  // Re-hash and re-check right before updating — the cached updates response
  // may be stale.
  const hashes = await jarHashes(id, dir);
  const targets = filenames.filter((filename: string) => hashes[filename]);
  if (!targets.length) {
    throw createError({
      statusCode: 404,
      statusMessage: "None of the requested jars exist",
    });
  }

  const latest = await checkUpdates(
    targets.map((filename: string) => hashes[filename]!),
    resolvedLoader,
    gameVersion
  );

  const updated: { from: string; to: string; version: string }[] = [];
  const failed: { filename: string; reason: string }[] = [];

  for (const filename of targets) {
    const sha1 = hashes[filename]!;
    const newest = latest[sha1];
    const newestFile =
      newest?.files.find((file) => file.primary) ?? newest?.files[0];

    if (!newest || !newestFile || newestFile.hashes.sha1 === sha1) {
      failed.push({ filename, reason: "Already up to date" });
      continue;
    }

    try {
      const jar = await downloadVersionJar(newest);
      // Write the new build first, then remove the old file — a failure
      // between the two leaves both versions (harmless duplicate) rather
      // than neither.
      await writeJars(id, dir, [jar]);
      if (jar.name !== filename) {
        await deleteJar(id, dir, filename);
      }
      updated.push({
        from: filename,
        to: jar.name,
        version: newest.version_number,
      });
    } catch (error) {
      console.error("[mcsm] Jar update failed:", filename, error);
      failed.push({
        filename,
        reason:
          (error as { statusMessage?: string })?.statusMessage ??
          "Download failed",
      });
    }
  }

  if (updated.length) {
    await recordActivity(
      server.volume,
      "jars-updated",
      updated.map((entry) => `${entry.from} → ${entry.to}`).join(", ")
    );
  }

  let restarted = false;
  if (restart && updated.length && server.running) {
    try {
      await restartServer(id);
      restarted = true;
    } catch (error) {
      console.error(error);
    }
  }

  return { updated, failed, restarted };
});
