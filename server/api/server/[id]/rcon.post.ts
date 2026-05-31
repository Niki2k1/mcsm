import { z } from "zod";
import { Rcon } from "rcon-client";

/**
 * Runs a single command against a server over RCON. MCSM reaches the container
 * by name on the shared Docker network; the RCON port is never published.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { command } = await useValidatedBody(event, { command: z.string() });

  const config = useRuntimeConfig();
  const { getServer } = useDocker();

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!server.running) {
    throw createError({ statusCode: 409, statusMessage: "Server is not running" });
  }
  if (!server.containerName) {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  let rcon: Rcon | undefined;
  try {
    rcon = await Rcon.connect({
      host: server.containerName,
      port: Number(config.rcon?.port ?? 25575),
      password: config.rcon?.password ?? "minecraft",
    });
    const response = await rcon.send(command);
    return { response };
  } catch (error) {
    console.error(error);
    throw createError({ statusCode: 502, statusMessage: "RCON command failed" });
  } finally {
    await rcon?.end().catch(() => {});
  }
});
