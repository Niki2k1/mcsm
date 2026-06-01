import { z } from "zod";

/** Live one-shot stats for a server (Docker metrics + uptime). */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { getServer, docker } = useDocker(event);

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!server.running) {
    return {
      running: false,
      startedAt: null,
      cpu: null,
      memUsed: null,
      memLimit: null,
      netRx: null,
      netTx: null,
    };
  }

  const stats = await readContainerStats(docker, id);
  return { running: true, startedAt: server.startedAt, ...stats };
});
