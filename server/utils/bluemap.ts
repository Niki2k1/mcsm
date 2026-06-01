import type { H3Event } from "h3";

/**
 * BlueMap 3D web map integration.
 *
 * BlueMap (https://bluemap.bluecolored.de) is installed through the itzg
 * image's MODRINTH_PROJECTS auto-install. Its integrated webserver listens on
 * port 8100 inside the container and is reached through MCSM's /map/<volume>/
 * proxy route over the shared Docker network — no published ports, no extra
 * proxy, no per-server domains.
 *
 * Before BlueMap renders anything, the user must consent to downloading
 * Mojang's assets (`accept-download: true` in core.conf). There is no env var
 * for this, so MCSM patches the file with a disposable helper container and
 * applies it with `bluemap reload` over RCON.
 */

/** Modrinth slug installed via MODRINTH_PROJECTS. */
export const BLUEMAP_SLUG = "bluemap";

/** Port BlueMap's integrated webserver listens on inside the container. */
export const BLUEMAP_PORT = 8100;

/**
 * Server types BlueMap can be installed on. Same plugin/mod-capable set as
 * pre-generation; the remaining MCSM types either have no loader (VANILLA) or
 * manage their own mod list (FTBA, AUTO_CURSEFORGE).
 */
export const BLUEMAP_SUPPORTED_TYPES = ["PAPER", "FABRIC", "FORGE"] as const;

export function serverTypeSupportsBluemap(type: string | null | undefined) {
  return (BLUEMAP_SUPPORTED_TYPES as readonly string[]).includes(type ?? "");
}

/** Whether BlueMap is in a MODRINTH_PROJECTS value. */
export function hasBluemap(projects: string | null | undefined): boolean {
  return hasModrinthProject(projects, BLUEMAP_SLUG);
}

/**
 * Where BlueMap's core.conf lives inside the world volume — plugins/ for
 * Bukkit-based servers, config/ for mod loaders.
 */
export function bluemapConfPath(type: string | null | undefined): string {
  return type === "PAPER"
    ? "plugins/BlueMap/core.conf"
    : "config/bluemap/core.conf";
}

/**
 * Whether BlueMap's webserver answers on the container. BlueMap doesn't start
 * its webserver until the Mojang asset download is accepted, so this
 * distinguishes "ready" from "needs setup" (or still booting).
 */
export async function probeBluemap(
  containerName: string,
  timeoutMs = 2_000
): Promise<boolean> {
  try {
    const response = await fetch(`http://${containerName}:${BLUEMAP_PORT}/`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type AcceptDownloadResult =
  /** core.conf was patched to accept-download: true. */
  | "patched"
  /** The download was already accepted. */
  | "already-accepted"
  /** core.conf doesn't exist yet — BlueMap hasn't finished installing. */
  | "missing";

/**
 * Set `accept-download: true` in the server's BlueMap core.conf via a
 * disposable helper container (the socket proxy has no EXEC permission).
 * The caller is responsible for applying it (`bluemap reload` over RCON or a
 * server restart).
 */
export async function acceptMojangDownload(
  event: H3Event | undefined,
  serverId: string
): Promise<AcceptDownloadResult> {
  const { getServer, docker, ensureImage } = useDocker(event);
  const server = await getServer(serverId);
  if (!server.volume) {
    throw createError({ statusCode: 400, statusMessage: "Server has no volume" });
  }

  await ensureImage(HELPER_IMAGE);

  const conf = `/data/${bluemapConfPath(server.config?.type)}`;
  const { exitCode, output } = await runHelper(
    docker,
    [
      "sh",
      "-c",
      `if [ ! -f "${conf}" ]; then echo missing; ` +
        `elif grep -Eq "accept-download:[[:space:]]*true" "${conf}"; then echo already-accepted; ` +
        `else sed -i -E "s/accept-download:[[:space:]]*false/accept-download: true/" "${conf}" && echo patched; fi`,
    ],
    [`${server.volume}:/data`]
  );

  if (exitCode !== 0) {
    console.error("[mcsm] BlueMap accept-download helper failed:", output);
    throw createError({
      statusCode: 500,
      statusMessage: "Could not update BlueMap's configuration",
    });
  }

  const result = output.trim().split("\n").pop();
  if (
    result === "patched" ||
    result === "already-accepted" ||
    result === "missing"
  ) {
    return result;
  }
  console.error("[mcsm] Unexpected accept-download helper output:", output);
  throw createError({
    statusCode: 500,
    statusMessage: "Could not update BlueMap's configuration",
  });
}
