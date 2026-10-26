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
 * short-lived container that mounts the world and the shared backup store
 * (the `mcsm-backups` volume, or `<dataRoot>/backups`). That only needs
 * CONTAINERS/VOLUMES/POST permissions, which the proxy allows.
 *
 * Two engines write into the store:
 * - restic (default): one deduplicated repository shared by all servers. A
 *   pre-generated world is mostly unchanged between backups, so each snapshot
 *   only stores the chunks that changed instead of another full copy.
 * - tar: one `.tar.gz` per backup. Used for uploads, and as the fallback when
 *   restic can't run (image unavailable, broken repository), so a backup still
 *   happens.
 */

/** Image used for disposable helper containers (also reused by bluemap.ts). */
export const HELPER_IMAGE = "alpine:3.22";

/** Pinned so a repository format change only happens with a deliberate bump. */
const RESTIC_IMAGE = "restic/restic:0.19.1";

const RESTIC_HELPER: HelperOptions = {
  image: RESTIC_IMAGE,
  // The image's entrypoint is `restic`; reset it so scripts run through sh.
  entrypoint: [""],
  env: [
    "RESTIC_REPOSITORY=/backups/restic",
    // restic insists on a password. The repo never leaves the backup store,
    // so a generated one kept next to it is enough.
    "RESTIC_PASSWORD_FILE=/backups/restic.password",
    // Helpers are disposable; a cache in the store saves re-reading the index.
    "RESTIC_CACHE_DIR=/backups/.restic-cache",
  ],
};

/** Creates the password and repository on first use. */
const RESTIC_INIT =
  '[ -s "$RESTIC_PASSWORD_FILE" ] || head -c 32 /dev/urandom | base64 > "$RESTIC_PASSWORD_FILE"; ' +
  "restic cat config > /dev/null 2>&1 || restic init -q";

/** Waits out other helpers' locks (e.g. a prune) instead of failing at once. */
const RETRY_LOCK = "--retry-lock 10m";

/** Volume names end up in paths and shell commands, so only allow safe ones. */
const SAFE_VOLUME = /^[a-z0-9-]+$/;

/** Backup tarball paths are derived from sanitized volume names + timestamps. */
const SAFE_FILENAME = /^[a-z0-9-]+\/\d+\.tar\.gz$/;

/** restic backups store `restic/<snapshot id>` as their filename. */
const SAFE_SNAPSHOT = /^restic\/([0-9a-f]{64})$/;

type BackupRow = typeof backups.$inferSelect;

function isSafeBackup(backup: BackupRow) {
  return backup.engine === "restic"
    ? SAFE_SNAPSHOT.test(backup.filename)
    : SAFE_FILENAME.test(backup.filename);
}

function snapshotId(backup: BackupRow) {
  return SAFE_SNAPSHOT.exec(backup.filename)![1];
}

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
type HelperOptions = { image: string; entrypoint?: string[]; env?: string[] };

export async function runHelper(
  docker: Docker,
  cmd: string[],
  binds: string[],
  options: HelperOptions = { image: HELPER_IMAGE }
): Promise<{ exitCode: number; output: string }> {
  const container = await docker.createContainer({
    Image: options.image,
    Entrypoint: options.entrypoint,
    Env: options.env,
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

type Archive = {
  engine: "restic" | "tar";
  filename: string;
  sizeBytes: number | null;
};

type WorldSource = {
  volume: string;
  volumeSource: string;
  backupSource: string;
};

/** Lines of helper output that are JSON objects (restic `--json` mixes in plain text). */
function jsonLines(output: string) {
  return output.split("\n").flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

async function resticBackup(
  docker: Docker,
  { volume, volumeSource, backupSource }: WorldSource
): Promise<Archive> {
  const { exitCode, output } = await runHelper(
    docker,
    [
      "sh",
      "-c",
      // Backing up `.` from inside /data stores the volume's contents at the
      // snapshot root, so restore and dump need no path juggling.
      `${RESTIC_INIT} && cd /data && restic backup -q --json ${RETRY_LOCK} --host mcsm --tag "${volume}" --exclude '*.filepart' .`,
    ],
    [`${volumeSource}:/data:ro`, `${backupSource}:/backups`],
    RESTIC_HELPER
  );
  const summary = jsonLines(output).find(
    (line) => line.message_type === "summary"
  );
  if (exitCode !== 0 || typeof summary?.snapshot_id !== "string") {
    throw new Error(`restic backup failed (exit ${exitCode}): ${output}`);
  }
  return {
    engine: "restic",
    filename: `restic/${summary.snapshot_id}`,
    // What this backup added to the store; unchanged chunks are shared.
    sizeBytes:
      typeof summary.data_added_packed === "number"
        ? summary.data_added_packed
        : null,
  };
}

async function tarBackup(
  docker: Docker,
  { volume, volumeSource, backupSource }: WorldSource
): Promise<Archive> {
  const filename = `${volume}/${Date.now()}.tar.gz`;
  const { exitCode, output } = await runHelper(
    docker,
    [
      "sh",
      "-c",
      // Print the archive size as the last output line so we can record it.
      `mkdir -p "/backups/${volume}" && tar czf "/backups/${filename}" --exclude='*.filepart' -C /data . && stat -c %s "/backups/${filename}"`,
    ],
    [`${volumeSource}:/data:ro`, `${backupSource}:/backups`]
  );
  if (exitCode !== 0) {
    console.error("[mcsm] Backup helper failed:", output);
    throw createError({ statusCode: 500, statusMessage: "Backup failed" });
  }
  return {
    engine: "tar",
    filename,
    sizeBytes: parseInt(output.trim().split("\n").pop() ?? "", 10) || null,
  };
}

/**
 * Snapshot the server's world volume into the backup store, with restic and
 * falling back to a tarball.
 *
 * If the server is running, world saving is paused (`save-off` + `save-all`)
 * around the snapshot so it is consistent, and re-enabled afterwards.
 */
export async function createBackup(
  event: H3Event | undefined,
  serverId: string,
  label?: string,
  options: { automatic?: boolean } = {}
) {
  const { getServer, docker, ensureImage, backupSource, ensureBackupStore } =
    useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume || !server.volumeSource) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no world volume to back up",
    });
  }
  if (!SAFE_VOLUME.test(server.volume)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid volume name",
    });
  }

  await ensureBackupStore();
  await ensureImage(HELPER_IMAGE);
  const source: WorldSource = {
    volume: server.volume,
    volumeSource: server.volumeSource,
    backupSource,
  };

  // BlueMap renders continuously into the same volume we're about to back
  // up, writing transient `*.filepart` tiles that it renames into place as it
  // goes. `save-off` doesn't stop it, so without pausing it the snapshot can
  // list a `.filepart` and then fail with "No such file or directory" when
  // BlueMap renames it away mid-run — aborting the whole backup.
  const bluemapInstalled = hasBluemap(server.config?.MODRINTH_PROJECTS);

  // Best-effort consistent snapshot — ignore RCON failures (server may be
  // booting or unreachable; the backup still works, just less consistent).
  const pauseSaves = server.running
    ? withRcon(event, serverId, async (rcon) => {
        await rcon.send("save-off");
        await rcon.send("save-all flush");
        if (bluemapInstalled) await rcon.send("bluemap stop");
      }).catch(() => {})
    : Promise.resolve();
  await pauseSaves;

  try {
    let archive: Archive;
    try {
      await ensureImage(RESTIC_IMAGE);
      archive = await resticBackup(docker, source);
    } catch (error) {
      console.warn("[mcsm] restic backup failed, falling back to tar:", error);
      archive = await tarBackup(docker, source);
    }

    const [row] = await db
      .insert(backups)
      .values({
        volume: server.volume,
        filename: archive.filename,
        engine: archive.engine,
        sizeBytes: archive.sizeBytes,
        createdAt: Date.now(),
        label: label ?? null,
        state: "done",
        automatic: options.automatic ?? false,
      })
      .returning();

    await recordActivity(server.volume, "backup-created", label);
    return row!;
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
  const {
    getServer,
    docker,
    ensureImage,
    stopServer,
    startServer,
    backupSource,
  } = useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no volume",
    });
  }

  const backup = await getBackup(server.volume, backupId);
  if (!backup || !isSafeBackup(backup)) {
    throw createError({ statusCode: 404, statusMessage: "Backup not found" });
  }

  const restic = backup.engine === "restic";
  await ensureImage(restic ? RESTIC_IMAGE : HELPER_IMAGE);

  const wasRunning = server.running;
  if (wasRunning) await stopServer(serverId);

  try {
    const { exitCode, output } = restic
      ? await runHelper(
          docker,
          [
            "sh",
            "-c",
            // `--delete` removes files the snapshot doesn't have, and files
            // that already match are left alone, so rolling back a big world
            // only rewrites what changed.
            `restic restore -q ${RETRY_LOCK} ${snapshotId(backup)} --target /data --delete`,
          ],
          // restic writes lock files into the repository, even to read it.
          [`${server.volumeSource}:/data`, `${backupSource}:/backups`],
          RESTIC_HELPER
        )
      : await runHelper(
          docker,
          [
            "sh",
            "-c",
            // Clear the volume (including dotfiles) before extracting.
            `find /data -mindepth 1 -delete && tar xzf "/backups/${backup.filename}" -C /data`,
          ],
          [`${server.volumeSource}:/data`, `${backupSource}:/backups:ro`]
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
 * Open a download stream for a backup as a `.tar.gz`.
 *
 * The backup lives in the backup store on the Docker host, which MCSM can't
 * read directly — so a helper container writes it to stdout (`cat` for a
 * tarball, `restic dump` piped through gzip for a snapshot, so both download
 * in the format uploads accept) and we stream that (demultiplexed) to the
 * caller. The returned `cleanup` must be called
 * once the consumer is done (or has aborted) to remove the helper container.
 */
export async function openBackupDownload(
  event: H3Event,
  serverId: string,
  backupId: number
) {
  const { getServer, docker, ensureImage, backupSource } = useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no volume",
    });
  }

  const backup = await getBackup(server.volume, backupId);
  if (!backup || !isSafeBackup(backup)) {
    throw createError({ statusCode: 404, statusMessage: "Backup not found" });
  }

  const helper =
    backup.engine === "restic"
      ? {
          options: RESTIC_HELPER,
          cmd: [
            "sh",
            "-c",
            `restic dump -q ${RETRY_LOCK} --archive tar ${snapshotId(backup)} / | gzip -1`,
          ],
          bind: `${backupSource}:/backups`,
        }
      : {
          options: { image: HELPER_IMAGE },
          cmd: ["cat", `/backups/${backup.filename}`],
          bind: `${backupSource}:/backups:ro`,
        };
  await ensureImage(helper.options.image);

  const container = await docker.createContainer({
    Image: helper.options.image,
    Entrypoint: helper.options.entrypoint,
    Env: helper.options.env,
    Cmd: helper.cmd,
    HostConfig: {
      Binds: [helper.bind],
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
  const { getServer, docker, ensureImage, backupSource, ensureBackupStore } =
    useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no volume",
    });
  }

  await ensureBackupStore();
  await ensureImage(HELPER_IMAGE);

  const filename = `${server.volume}/${Date.now()}.tar.gz`;
  if (!SAFE_FILENAME.test(filename)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid volume name",
    });
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
      Binds: [`${backupSource}:/backups`],
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

    await recordActivity(server.volume, "backup-created", label ?? "Uploaded");
    return row!;
  } finally {
    await container.remove({ force: true }).catch(() => {});
  }
}

/** Delete a backup (tarball or restic snapshot) and its metadata. */
export async function deleteBackup(
  event: H3Event | undefined,
  serverId: string,
  backupId: number
) {
  const { getServer, docker, ensureImage, backupSource } = useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no volume",
    });
  }

  const backup = await getBackup(server.volume, backupId);
  if (!backup || !isSafeBackup(backup)) {
    throw createError({ statusCode: 404, statusMessage: "Backup not found" });
  }

  const restic = backup.engine === "restic";
  await ensureImage(restic ? RESTIC_IMAGE : HELPER_IMAGE);

  const { exitCode, output } = restic
    ? await runHelper(
        docker,
        [
          "sh",
          "-c",
          // Without the prune the snapshot's unique chunks would stay on disk.
          `restic forget -q ${RETRY_LOCK} --prune ${snapshotId(backup)}`,
        ],
        [`${backupSource}:/backups`],
        RESTIC_HELPER
      )
    : await runHelper(
        docker,
        ["rm", "-f", `/backups/${backup.filename}`],
        [`${backupSource}:/backups`]
      );
  if (exitCode !== 0) {
    console.error("[mcsm] Backup delete helper failed:", output);
    throw createError({ statusCode: 500, statusMessage: "Delete failed" });
  }

  await db.delete(backups).where(eq(backups.id, backupId));
  await recordActivity(server.volume, "backup-deleted");
  return { ok: true };
}
