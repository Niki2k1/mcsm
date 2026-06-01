import { Readable } from "node:stream";
import { PassThrough } from "node:stream";
import type { H3Event } from "h3";

/**
 * Write a (small) file into a Docker volume via a disposable helper container.
 *
 * Same constraint as backups: the socket proxy has no EXEC permission, so the
 * file is piped into a helper container's stdin, which writes it to the
 * mounted volume. Used for the server icon.
 */

const HELPER_IMAGE = "alpine:3.22";

/** Only allow writing simple filenames into the volume root. */
const SAFE_PATH = /^[A-Za-z0-9._-]+$/;

export async function writeVolumeFile(
  event: H3Event,
  volume: string,
  filename: string,
  content: Buffer
) {
  if (!SAFE_PATH.test(filename)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid filename" });
  }

  const { docker, ensureImage } = useDocker(event);
  await ensureImage(HELPER_IMAGE);

  const container = await docker.createContainer({
    Image: HELPER_IMAGE,
    Cmd: ["sh", "-c", `cat > "/data/${filename}"`],
    OpenStdin: true,
    StdinOnce: true,
    HostConfig: {
      Binds: [`${volume}:/data`],
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

    // Drain output so the stream doesn't back up.
    const sink = new PassThrough();
    sink.resume();
    container.modem.demuxStream(attachStream, sink, sink);

    await container.start();

    Readable.from(content).pipe(attachStream);

    const result = await container.wait();
    if (result.StatusCode !== 0) {
      throw createError({
        statusCode: 500,
        statusMessage: `Failed to write ${filename} to the world volume`,
      });
    }
  } finally {
    await container.remove({ force: true }).catch(() => {});
  }
}
