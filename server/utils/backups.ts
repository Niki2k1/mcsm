import { PassThrough } from "node:stream";
import type { H3Event } from "h3";
import type Docker from "dockerode";
import { and, desc, eq } from "drizzle-orm";
// Imported explicitly (not via the `db` auto-import): the auto-import's type
// resolves to `any` under pnpm because it references the package by path,
// which bypasses the package's `exports` types.
import { db } from "@nuxthub/db";
import { backups } from "../db/schema";

/**
 * World backups via disposable helper containers.
 *
 * The Docker socket proxy in production has no EXEC permission, so we can't
 * `docker exec` into running servers. Instead, every backup operation runs a
 * short-lived alpine container that mounts the world volume and the shared
 * `mcsm-backups` volume, and tars/untars between them. That only needs
 * CONTAINERS/VOLUMES/POST permissions, which the proxy allows.
 */

const BACKUP_VOLUME = "mcsm-backups";
/** Image used for disposable helper containers (also reused by bluemap.ts). */
export const HELPER_IMAGE = "alpine:3.22";

/** Backup tarball paths are derived from sanitized volume names + timestamps. */
const SAFE_FILENAME = /^[a-z0-9-]+\/\d+\.tar\.gz$/;

// --- Helper container plumbing ------------------------------------------------

/** Strip Docker's 8-byte multiplexing headers from a non-TTY logs buffer. */
function demuxLogs(buffer: Buffer): string {
  let output = "";
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset + 4);
    output += buffer.subarray(offset + 8, offset + 8 + size).toString("utf8");
    offset += 8 + size;
  }
  return output;
}

/**
 * Run a one-shot helper container and return its exit code + output. Exported
 * for other volume-touching features (e.g. BlueMap's config patch) — the
 * socket proxy has no EXEC permission, so this is the only way to run
 * commands against a volume.
 */
export async function runHelper(
  docker: Docker,
  cmd: string[],
  binds: string[]
): Promise<{ exitCode: number; output: string }> {
  const container = await docker.createContainer({
    Image: HELPER_IMAGE,
    Cmd: cmd,
    HostConfig: {
      Binds: binds,
      // Tar jobs need no network — keeps helpers off the shared networks.
      NetworkMode: "none",
    },
    Labels: { "mcsm.helper": "true" },
  });

  try {
    await container.start();
    const result = await container.wait();
    const logs = (await container.logs({
      stdout: true,
      stderr: true,
      follow: false,
    })) as unknown as Buffer;
    return { exitCode: result.StatusCode, output: demuxLogs(logs) };
  } finally {
    await container.remove({ force: true }).catch(() => {});
  }
}

async function ensureBackupVolume(docker: Docker) {
  // Creating an existing volume is a no-op in the Docker API.
  await docker.createVolume({ Name: BACKUP_VOLUME });
}

// --- Public API -----------------------------------------------------------------

export async function listBackups(volume: string) {
  return db
    .select()
    .from(backups)
    .where(eq(backups.volume, volume))
    .orderBy(desc(backups.createdAt));
}

export async function getBackup(volume: string, backupId: number) {
  return db
    .select()
    .from(backups)
    .where(and(eq(backups.id, backupId), eq(backups.volume, volume)))
    .get();
}

/**
 * Tar the server's world volume into the backup volume.
 *
 * If the server is running, world saving is paused (`save-off` + `save-all`)
 * around the tar so the snapshot is consistent, and re-enabled afterwards.
 */
export async function createBackup(
  event: H3Event,
  serverId: string,
  label?: string
) {
  const { getServer, docker, ensureImage } = useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no world volume to back up",
    });
  }

  await ensureBackupVolume(docker);
  await ensureImage(HELPER_IMAGE);

  const filename = `${server.volume}/${Date.now()}.tar.gz`;
  if (!SAFE_FILENAME.test(filename)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid volume name" });
  }

  // BlueMap renders continuously into the same volume we're about to tar,
  // writing transient `*.filepart` tiles that it renames into place as it
  // goes. `save-off` doesn't stop it, so without pausing it tar can list a
  // `.filepart` and then fail with "No such file or directory" when BlueMap
  // renames it away mid-archive — aborting the whole backup.
  const bluemapInstalled = hasBluemap(server.config?.MODRINTH_PROJECTS);

  // Best-effort consistent snapshot — ignore RCON failures (server may be
  // booting or unreachable; the tar still works, just less consistent).
  const pauseSaves = server.running
    ? withRcon(event, serverId, async (rcon) => {
        await rcon.send("save-off");
        await rcon.send("save-all flush");
        if (bluemapInstalled) await rcon.send("bluemap stop");
      }).catch(() => {})
    : Promise.resolve();
  await pauseSaves;

  try {
    const { exitCode, output } = await runHelper(
      docker,
      [
        "sh",
        "-c",
        // Skip incomplete tiles BlueMap may have left behind (`*.filepart`) —
        // they're never restorable. Print the archive size as the last output
        // line so we can record it.
        `mkdir -p "/backups/${server.volume}" && tar czf "/backups/${filename}" --exclude='*.filepart' -C /data . && stat -c %s "/backups/${filename}"`,
      ],
      [`${server.volume}:/data:ro`, `${BACKUP_VOLUME}:/backups`]
    );

    if (exitCode !== 0) {
      console.error("[mcsm] Backup helper failed:", output);
      throw createError({
        statusCode: 500,
        statusMessage: "Backup failed",
      });
    }

    const sizeBytes =
      parseInt(output.trim().split("\n").pop() ?? "", 10) || null;

    const [row] = await db
      .insert(backups)
      .values({
        volume: server.volume,
        filename,
        sizeBytes,
        createdAt: Date.now(),
        label: label ?? null,
        state: "done",
      })
      .returning();

    await recordActivity(server.volume, "backup-created", label);
    return row;
  } finally {
    if (server.running) {
      await withRcon(event, serverId, async (rcon) => {
        await rcon.send("save-on");
        if (bluemapInstalled) await rcon.send("bluemap start");
      }).catch(() => {});
    }
  }
}

/**
 * Restore a backup into the server's world volume. The server is stopped for
 * the restore and started again afterwards (if it was running).
 */
export async function restoreBackup(
  event: H3Event,
  serverId: string,
  backupId: number
) {
  const { getServer, docker, ensureImage, stopServer, startServer } =
    useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume) {
    throw createError({ statusCode: 400, statusMessage: "Server has no volume" });
  }

  const backup = await getBackup(server.volume, backupId);
  if (!backup || !SAFE_FILENAME.test(backup.filename)) {
    throw createError({ statusCode: 404, statusMessage: "Backup not found" });
  }

  await ensureImage(HELPER_IMAGE);

  const wasRunning = server.running;
  if (wasRunning) await stopServer(serverId);

  try {
    const { exitCode, output } = await runHelper(
      docker,
      [
        "sh",
        "-c",
        // Clear the volume (including dotfiles) before extracting.
        `find /data -mindepth 1 -delete && tar xzf "/backups/${backup.filename}" -C /data`,
      ],
      [`${server.volume}:/data`, `${BACKUP_VOLUME}:/backups:ro`]
    );

    if (exitCode !== 0) {
      console.error("[mcsm] Restore helper failed:", output);
      throw createError({ statusCode: 500, statusMessage: "Restore failed" });
    }

    await recordActivity(
      server.volume,
      "backup-restored",
      new Date(backup.createdAt).toISOString()
    );
    return { ok: true };
  } finally {
    if (wasRunning) await startServer(serverId);
  }
}

/**
 * Open a download stream for a backup tarball.
 *
 * The tarball lives on the `mcsm-backups` Docker volume, which MCSM can't
 * read directly — so a helper container `cat`s it to stdout and we stream
 * that (demultiplexed) to the caller. The returned `cleanup` must be called
 * once the consumer is done (or has aborted) to remove the helper container.
 */
export async function openBackupDownload(
  event: H3Event,
  serverId: string,
  backupId: number
) {
  const { getServer, docker, ensureImage } = useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume) {
    throw createError({ statusCode: 400, statusMessage: "Server has no volume" });
  }

  const backup = await getBackup(server.volume, backupId);
  if (!backup || !SAFE_FILENAME.test(backup.filename)) {
    throw createError({ statusCode: 404, statusMessage: "Backup not found" });
  }

  await ensureImage(HELPER_IMAGE);

  const container = await docker.createContainer({
    Image: HELPER_IMAGE,
    Cmd: ["cat", `/backups/${backup.filename}`],
    HostConfig: {
      Binds: [`${BACKUP_VOLUME}:/backups:ro`],
      NetworkMode: "none",
    },
    Labels: { "mcsm.helper": "true" },
  });

  const cleanup = async () => {
    await container.remove({ force: true }).catch(() => {});
  };

  try {
    // Attach before starting so no output is missed, then demux stdout into
    // the stream we hand back. stderr only carries error noise — drain it.
    const attachStream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stderr.resume();
    container.modem.demuxStream(attachStream, stdout, stderr);

    attachStream.on("end", () => stdout.end());
    attachStream.on("error", (error: Error) => stdout.destroy(error));

    await container.start();

    return { backup, stream: stdout, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/**
 * Store an uploaded backup tarball on the backup volume.
 *
 * The upload stream is piped into a helper container's stdin, which writes it
 * to the volume and then validates it really is a readable .tar.gz before the
 * metadata row is created — a corrupt or aborted upload never becomes a
 * restorable backup.
 */
export async function uploadBackup(
  event: H3Event,
  serverId: string,
  body: NodeJS.ReadableStream,
  label?: string
) {
  const { getServer, docker, ensureImage } = useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume) {
    throw createError({ statusCode: 400, statusMessage: "Server has no volume" });
  }

  await docker.createVolume({ Name: BACKUP_VOLUME });
  await ensureImage(HELPER_IMAGE);

  const filename = `${server.volume}/${Date.now()}.tar.gz`;
  if (!SAFE_FILENAME.test(filename)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid volume name" });
  }
  const target = `/backups/${filename}`;

  const container = await docker.createContainer({
    Image: HELPER_IMAGE,
    Cmd: [
      "sh",
      "-c",
      // Write stdin to the target, verify it is a valid gzip'd tar, then print
      // its size. Any failure removes the partial file and exits non-zero.
      `mkdir -p "/backups/${server.volume}" && cat > "${target}" && ` +
        `tar tzf "${target}" > /dev/null 2>&1 && stat -c %s "${target}" || ` +
        `{ rm -f "${target}"; exit 1; }`,
    ],
    OpenStdin: true,
    StdinOnce: true,
    HostConfig: {
      Binds: [`${BACKUP_VOLUME}:/backups`],
      NetworkMode: "none",
    },
    Labels: { "mcsm.helper": "true" },
  });

  try {
    const attachStream = (await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true,
    })) as unknown as NodeJS.ReadWriteStream;

    // Collect stdout (the stat size) while the upload streams in.
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stderr.resume();
    container.modem.demuxStream(attachStream, stdout, stderr);
    let output = "";
    stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });

    await container.start();

    // Pipe the upload into the container's stdin; ending the write side
    // half-closes the hijacked connection so `cat` sees EOF.
    body.pipe(attachStream);

    const result = await container.wait();
    if (result.StatusCode !== 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "Uploaded file is not a valid .tar.gz backup",
      });
    }

    const sizeBytes = parseInt(output.trim().split("\n").pop() ?? "", 10) || null;

    const [row] = await db
      .insert(backups)
      .values({
        volume: server.volume,
        filename,
        sizeBytes,
        createdAt: Date.now(),
        label: label ?? null,
        state: "done",
      })
      .returning();

    await recordActivity(server.volume, "backup-created", label ?? "Uploaded");
    return row;
  } finally {
    await container.remove({ force: true }).catch(() => {});
  }
}

/** Delete a backup tarball and its metadata. */
export async function deleteBackup(
  event: H3Event,
  serverId: string,
  backupId: number
) {
  const { getServer, docker, ensureImage } = useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume) {
    throw createError({ statusCode: 400, statusMessage: "Server has no volume" });
  }

  const backup = await getBackup(server.volume, backupId);
  if (!backup || !SAFE_FILENAME.test(backup.filename)) {
    throw createError({ statusCode: 404, statusMessage: "Backup not found" });
  }

  await ensureImage(HELPER_IMAGE);

  const { exitCode, output } = await runHelper(
    docker,
    ["rm", "-f", `/backups/${backup.filename}`],
    [`${BACKUP_VOLUME}:/backups`]
  );
  if (exitCode !== 0) {
    console.error("[mcsm] Backup delete helper failed:", output);
    throw createError({ statusCode: 500, statusMessage: "Delete failed" });
  }

  await db.delete(backups).where(eq(backups.id, backupId));
  await recordActivity(server.volume, "backup-deleted");
  return { ok: true };
}
