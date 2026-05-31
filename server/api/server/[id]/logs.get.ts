import { z } from "zod";
import { PassThrough } from "node:stream";

/**
 * Streams a container's console (stdout/stderr) to the browser as
 * Server-Sent Events: the last 200 lines, then live output as it arrives.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { docker } = useDocker();
  const container = docker.getContainer(id);

  let logStream: NodeJS.ReadableStream & { destroy?: () => void };
  try {
    logStream = (await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 200,
      timestamps: false,
    })) as NodeJS.ReadableStream & { destroy?: () => void };
  } catch (error) {
    console.error(error);
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const eventStream = createEventStream(event);

  // Containers aren't TTY, so Docker multiplexes stdout/stderr — demux both
  // into one line-buffered output.
  const out = new PassThrough();
  container.modem.demuxStream(logStream, out, out);

  let buffer = "";
  out.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      eventStream.push(line);
    }
  });

  logStream.on("end", () => eventStream.close());
  logStream.on("error", () => eventStream.close());

  eventStream.onClosed(async () => {
    logStream.destroy?.();
    await eventStream.close();
  });

  return eventStream.send();
});
