import { Rcon } from "rcon-client";
import type { H3Event } from "h3";

/**
 * Run RCON commands against a server's container.
 *
 * MCSM reaches the container by name on the shared Docker network; the RCON
 * port is never published. The connection is opened for the callback and
 * always closed afterwards.
 *
 * Throws 404 (unknown server), 409 (not running) or 502 (RCON failure) —
 * matching what API routes are expected to surface.
 */
export async function withRcon<T>(
  event: H3Event,
  serverId: string,
  fn: (rcon: Rcon) => Promise<T>
): Promise<T> {
  const config = useRuntimeConfig(event);
  const { getServer } = useDocker(event);

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(serverId);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!server.running) {
    throw createError({
      statusCode: 409,
      statusMessage: "Server is not running",
    });
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
    return await fn(rcon);
  } catch (error) {
    // Don't re-wrap errors the callback intentionally threw.
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 502,
      statusMessage: "RCON command failed",
    });
  } finally {
    await rcon?.end().catch(() => {});
  }
}

/**
 * Parse Minecraft's "There are N ... players online: Alice, Bob" responses
 * into a list of names. Works for `list` and `whitelist list`.
 */
export function parsePlayerNames(response: string): string[] {
  const colon = response.indexOf(":");
  if (colon === -1) return [];
  return response
    .slice(colon + 1)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}
