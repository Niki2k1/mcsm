import { z } from "zod";
import { serverConfigSchema } from "../../../schema/server.schema";

/**
 * Duplicate a server under a new name (e.g. a staging copy for testing).
 *
 * The clone gets the source's full config but its own identity: the new name
 * drives the subdomain, container name and world volume, and the host port is
 * dropped (two containers can't publish the same port). The world is copied
 * volume-to-volume through a helper container — the socket proxy has no EXEC
 * permission, so this is the only way to touch volume contents.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { name, copyWorld } = await useValidatedBody(event, {
    name: z.string().trim().min(1),
    copyWorld: z.boolean().default(true),
  });

  const { getServer, docker, ensureImage, provisionServer } = useDocker(event);

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
  if (!server.config) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no stored configuration to duplicate",
    });
  }
  if (!sanitize(name)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Name must contain at least one letter or number",
    });
  }

  // The new name drives the clone's whole identity — subdomain, container and
  // volume all derive from it, so the explicit subdomain override is dropped.
  const config = serverConfigSchema.parse({
    ...server.config,
    name,
    subdomain: null,
    hostPort: null,
  });

  const spec = await buildServerSpec(config, event);

  // The container name and volume must be free — Docker would reject the
  // container with a raw 409, and copying into a volume that already holds
  // another world would silently mix two servers' files.
  const nameTaken =
    spec.volume === server.volume ||
    (await docker
      .getContainer(spec.name)
      .inspect()
      .then(() => true)
      .catch(() => false)) ||
    (await docker
      .getVolume(spec.volume)
      .inspect()
      .then(() => true)
      .catch(() => false));
  if (nameTaken) {
    throw createError({
      statusCode: 409,
      statusMessage: `A server or world named “${spec.name}” already exists`,
    });
  }

  if (copyWorld && server.volume) {
    await docker.createVolume({ Name: spec.volume });
    await ensureImage(HELPER_IMAGE);

    // Same consistency dance as backups: pause world saves (and BlueMap's
    // continuous tile writes) while the volume is read. Best-effort — a
    // booting/unreachable server still copies, just less consistently.
    const bluemapInstalled = hasBluemap(server.config.MODRINTH_PROJECTS);
    if (server.running) {
      await withRcon(event, id, async (rcon) => {
        await rcon.send("save-off");
        await rcon.send("save-all flush");
        if (bluemapInstalled) await rcon.send("bluemap stop");
      }).catch(() => {});
    }

    try {
      const { exitCode, output } = await runHelper(
        docker,
        [
          "sh",
          "-c",
          // tar (not cp) so `*.filepart` tiles BlueMap may rename away
          // mid-copy can be excluded; run as root it preserves ownership, so
          // the itzg uid:1000 world stays writable. pipefail surfaces a
          // failure of the reading tar, not just the writing one.
          "set -o pipefail; tar cf - --exclude='*.filepart' -C /src . | tar xf - -C /dst",
        ],
        [`${server.volume}:/src:ro`, `${spec.volume}:/dst`]
      );

      if (exitCode !== 0) {
        console.error("[mcsm] Duplicate copy helper failed:", output);
        await docker.getVolume(spec.volume).remove().catch(() => {});
        throw createError({
          statusCode: 500,
          statusMessage: "Failed to copy the world data",
        });
      }
    } finally {
      if (server.running) {
        await withRcon(event, id, async (rcon) => {
          await rcon.send("save-on");
          if (bluemapInstalled) await rcon.send("bluemap start");
        }).catch(() => {});
      }
    }
  }

  try {
    const container = await provisionServer({
      name: spec.name,
      image: spec.image,
      env: spec.env,
      labels: spec.labels,
      memoryBytes: spec.memoryBytes,
      port: spec.port,
      hostPort: spec.hostPort,
      volume: spec.volume,
      restartPolicy: spec.restartPolicy,
    });

    await recordActivity(spec.volume, "duplicated", `from ${server.name}`);

    return { id: container.id, name: container.name, domain: spec.domain };
  } catch (error) {
    console.error(error);
    // Don't leave an orphaned copy of the world behind.
    if (copyWorld) await docker.getVolume(spec.volume).remove().catch(() => {});
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create the duplicate server",
    });
  }
});
