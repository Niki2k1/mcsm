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
 * pre-generation; AUTO_CURSEFORGE works because the itzg image resolves the
 * modpack's loader before the Modrinth install step runs. VANILLA has no
 * loader and FTBA's installer manages its own files.
 */
export const BLUEMAP_SUPPORTED_TYPES = [
  "PAPER",
  "FABRIC",
  "FORGE",
  "AUTO_CURSEFORGE",
] as const;

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
  target: { name: string; id: string },
  timeoutMs = 2_000
): Promise<boolean> {
  try {
    // Container name in production, 127.0.0.1 dev tunnel in local dev.
    const address = await containerAddress(undefined, target, BLUEMAP_PORT);
    const response = await fetch(`http://${address.host}:${address.port}/`, {
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

// --- Render status & updates ---------------------------------------------------

export type BluemapMapProgress = {
  /** BlueMap map id, e.g. "world". */
  map: string;
  percent: number | null;
  /** Human readable, e.g. "27 minutes" — as reported by BlueMap. */
  remaining: string | null;
  /** Region file currently being rendered. */
  region: { x: number; z: number } | null;
};

export type BluemapRenderStatus = {
  /** Number of running render threads (null if not reported). */
  renderThreads: number | null;
  /** Maps currently being rendered. */
  updating: BluemapMapProgress[];
  /** Maps queued behind the current one. */
  pendingMaps: number;
  /** Nothing rendering and nothing queued. */
  idle: boolean;
  raw: string;
};

/**
 * Parse the `bluemap` status command output, e.g.:
 *
 *   BlueMap Status >
 *    ✔ 1 render-thread is running
 *    ⛏ map world is currently being updated
 *    ├ progress: 24.199%
 *    ├ remaining time: 27 minutes
 *    └ updating region (1, -2)
 *    ⌛ 2 maps have pending updates
 *
 * Every field is matched independently so wording changes between BlueMap
 * versions degrade gracefully instead of breaking the whole reading.
 */
export function parseBluemapStatus(response: string): BluemapRenderStatus {
  const text = stripMinecraftFormatting(response);
  const lines = text.split("\n").map((line) => line.trim());

  let renderThreads: number | null = null;
  let pendingMaps = 0;
  const updating: BluemapMapProgress[] = [];
  let current: BluemapMapProgress | null = null;

  for (const line of lines) {
    const threads = /(\d+)\s+render-threads?\s+(?:is|are)\s+running/i.exec(
      line
    );
    if (threads) renderThreads = Number(threads[1]);

    const pending = /(\d+)\s+maps?\s+ha(?:ve|s)\s+pending\s+update/i.exec(line);
    if (pending) pendingMaps = Number(pending[1]);

    const map = /map\s+(\S+)\s+is currently being (?:updated|rendered)/i.exec(
      line
    );
    if (map) {
      current = { map: map[1]!, percent: null, remaining: null, region: null };
      updating.push(current);
      continue;
    }
    if (!current) continue;

    const percent = /progress:\s*([\d.]+)\s*%/i.exec(line);
    if (percent) current.percent = Number(percent[1]);

    const remaining = /remaining time:\s*(.+)/i.exec(line);
    if (remaining) current.remaining = remaining[1]!.trim();

    const region = /updating region\s*\((-?\d+),\s*(-?\d+)\)/i.exec(line);
    if (region) current.region = { x: Number(region[1]), z: Number(region[2]) };
  }

  return {
    renderThreads,
    updating,
    pendingMaps,
    idle: updating.length === 0 && pendingMaps === 0,
    raw: text.trim(),
  };
}

/**
 * Flush the world to disk and have BlueMap rescan + re-render changed areas,
 * returning the fresh render status. One RCON connection for all three
 * commands.
 */
export async function triggerBluemapUpdate(
  event: H3Event | undefined,
  serverId: string
): Promise<BluemapRenderStatus> {
  return withRcon(event, serverId, async (rcon) => {
    // Chunks generated by Chunky may not be on disk yet — BlueMap can only
    // render what's saved.
    await rcon.send("save-all");
    await rcon.send("bluemap update");
    return parseBluemapStatus(await rcon.send("bluemap"));
  });
}

/**
 * After pre-generation finishes: if the server has BlueMap enabled, kick off a
 * render update so the new chunks show up on the map without manual steps.
 * Fire-and-forget — failures are logged, never thrown.
 */
export async function updateBluemapAfterPregen(volume: string): Promise<void> {
  try {
    const { listServers } = useDocker();
    const servers = await listServers();
    const server = servers.find((entry) => entry.volume === volume);
    if (!server?.running || !server.config?.BLUEMAP) return;

    await triggerBluemapUpdate(undefined, server.id);
    console.info(
      `[mcsm] Pre-generation finished for ${volume} — triggered BlueMap update`
    );
  } catch (error) {
    console.error(
      `[mcsm] Could not trigger BlueMap update after pre-generation (${volume}):`,
      error
    );
  }
}
