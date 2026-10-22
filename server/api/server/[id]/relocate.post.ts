import * as v from "valibot";

/**
 * Move a server's world to where the current `NUXT_DOCKER_DATA_ROOT` puts new
 * worlds (e.g. Unraid `/mnt/user/...` → `/mnt/cache/...`, or named volume →
 * host directory).
 *
 * Recreates keep a world on the storage it was created on, so worlds never
 * silently move when the setting changes; this is the explicit way to follow
 * it. The target may already show the same files (Unraid exposes one
 * directory under both /mnt/user and /mnt/cache) — then only the mount
 * switches. An empty target gets a copy; anything else is refused rather than
 * mixing two worlds. The old copy is never deleted here.
 */

/**
 * Ends with `same`, `copied` or `conflict`. "Same" is decided by an identical
 * path/size/mtime listing rather than a marker file: on Unraid a new marker
 * lands on the cache even when part of the world still sits on the array, so
 * it would wrongly report a half-visible world as complete.
 */
const RELOCATE_SCRIPT = `
set -eo pipefail
listing() { (cd "$1" && find . -type f -exec stat -c '%n %s %Y' {} + | sort); }
if [ "$(listing /src)" = "$(listing /dst)" ]; then echo same; exit 0; fi
if [ -n "$(ls -A /dst)" ]; then echo conflict; exit 0; fi
echo copying
tar cf - -C /src . | tar xf - -C /dst
echo copied
`;

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const {
    getServer,
    docker,
    ensureImage,
    stopServer,
    startServer,
    removeWorld,
  } = useDocker(event);

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
  if (!server.config) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no stored configuration to recreate it from",
    });
  }
  const from = server.volumeSource;
  const to = server.targetSource;
  if (!server.volume || !from || !to) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no world volume",
    });
  }
  if (from === to) {
    throw createError({
      statusCode: 400,
      statusMessage: "The world already lives in the configured data root",
    });
  }

  // Files must not change while they are compared or copied.
  if (server.running) await stopServer(id);

  let mode: "same" | "copied";
  try {
    if (!to.startsWith("/")) await docker.createVolume({ Name: to });
    await ensureImage(HELPER_IMAGE);
    const { exitCode, output } = await runHelper(
      docker,
      ["sh", "-c", RELOCATE_SCRIPT],
      [`${from}:/src:ro`, `${to}:/dst`]
    );
    const result = output.trim().split("\n").pop();

    if (
      exitCode !== 0 ||
      (result !== "same" && result !== "copied" && result !== "conflict")
    ) {
      console.error("[mcsm] Relocate helper failed:", output);
      // Only clean up after a started copy: before that, the target may be
      // the very directory the world lives in.
      if (output.includes("copying")) await removeWorld(to);
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to copy the world data",
      });
    }
    if (result === "conflict") {
      throw createError({
        statusCode: 409,
        statusMessage: `${to} already contains different data. Move or delete it first — on Unraid, make sure the share's files are all on that pool (run the mover).`,
      });
    }
    mode = result;
  } catch (error) {
    if (server.running) await startServer(id).catch(() => {});
    throw error;
  }

  const recreated = await recreateServer(
    event,
    id,
    server.config,
    `${from} → ${to}${mode === "copied" ? " (copied)" : ""}`,
    "storage-relocated",
    to
  );

  return { id: recreated.id, mode, from, to };
});
