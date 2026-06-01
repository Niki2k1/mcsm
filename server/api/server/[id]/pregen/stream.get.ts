import { z } from "zod";

/**
 * Live pre-generation progress as Server-Sent Events.
 *
 * The server polls Chunky over RCON every couple of seconds and pushes each
 * reading to the client — same pattern as the console log stream, so the
 * frontend consumes it with a plain EventSource. Error frames (server
 * restarting, Chunky still installing) keep the stream open; the client
 * decides when to give up.
 */
const POLL_INTERVAL_MS = 2_000;

export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { getServer } = useDocker(event);
  let volume: string | undefined;
  try {
    volume = (await getServer(id)).volume;
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const eventStream = createEventStream(event);
  let closed = false;
  let polling = false;

  async function tick() {
    // Skip a beat if RCON is slower than the poll interval.
    if (closed || polling) return;
    polling = true;

    try {
      const progress = await withRcon(event, id, chunkyProgress);
      const task = volume ? await applyChunkyProgress(volume, progress) : null;
      if (closed) return;

      await eventStream.push(JSON.stringify({ ok: true, progress, task }));

      // Task finished — final frame sent, the client refetches status.
      if (progress.done) {
        closed = true;
        await eventStream.close();
      }
    } catch (error) {
      if (closed) return;
      const statusCode =
        (error as { statusCode?: number })?.statusCode ?? 502;
      await eventStream
        .push(JSON.stringify({ ok: false, statusCode }))
        .catch(() => {});
    } finally {
      polling = false;
    }
  }

  const interval = setInterval(tick, POLL_INTERVAL_MS);
  interval.unref?.();
  void tick();

  eventStream.onClosed(async () => {
    closed = true;
    clearInterval(interval);
    await eventStream.close();
  });

  return eventStream.send();
});
