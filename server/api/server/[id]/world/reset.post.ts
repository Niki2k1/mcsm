import { z } from "zod";

/** World folder names must stay shell-safe inside the helper command. */
const SAFE_LEVEL = /^[A-Za-z0-9 _.-]+$/;

/**
 * Reset the server's world for a fresh start (e.g. hardcore challenge runs).
 *
 * The current world is never thrown away: a backup is created first, then the
 * world folders are deleted via a helper container and the server boots a
 * fresh world. The old run stays restorable from the Backups tab.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { getServer, docker, ensureImage, stopServer, startServer } =
    useDocker(event);

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
  if (!server.volume) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no world volume",
    });
  }

  const level = server.config?.LEVEL || "world";
  if (!SAFE_LEVEL.test(level)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid world name" });
  }

  // 1. Safety net: the current world becomes a regular backup.
  const backup = await createBackup(event, id, "Before world reset");

  // 2. Stop the server while the world is swapped out.
  const wasRunning = server.running;
  if (wasRunning) await stopServer(id);

  // 3. Delete the world folders — the base world plus the per-dimension
  //    folders Paper-family servers create.
  await ensureImage(HELPER_IMAGE);
  const { exitCode, output } = await runHelper(
    docker,
    [
      "sh",
      "-c",
      `rm -rf "/data/${level}" "/data/${level}_nether" "/data/${level}_the_end"`,
    ],
    [`${server.volume}:/data`]
  );
  if (exitCode !== 0) {
    console.error("[mcsm] World reset helper failed:", output);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to reset the world",
    });
  }

  // 4. Boot the fresh world (only if the server was running before).
  if (wasRunning) await startServer(id);

  await recordActivity(
    server.volume,
    "world-reset",
    `Previous world saved as backup #${backup.id}`
  );

  return { ok: true, backupId: backup.id, restarted: wasRunning };
});
