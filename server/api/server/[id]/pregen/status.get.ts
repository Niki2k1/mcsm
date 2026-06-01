import { z } from "zod";

/**
 * Pre-generation status for a server: whether the type supports it, whether
 * Chunky is installed, and the current task (stored row merged with a live
 * RCON reading when the server is up).
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { getServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const supported = serverTypeSupportsPregen(server.config?.type);
  const chunkyInstalled =
    supported && hasChunky(server.config?.MODRINTH_PROJECTS);

  let task = server.volume ? await getPregenTask(server.volume) : null;
  let live = false;

  // Best-effort live reading — RCON may be down (server booting, Chunky still
  // downloading, local dev). The stored row is the fallback.
  if (chunkyInstalled && server.running && server.volume) {
    try {
      const progress = await withRcon(event, id, chunkyProgress);
      task = await applyChunkyProgress(server.volume, progress);
      live = true;
    } catch {
      // Keep the stored task.
    }
  }

  return {
    supported,
    chunkyInstalled,
    running: server.running,
    live,
    task,
  };
});
