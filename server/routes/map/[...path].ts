/**
 * BlueMap web UI proxy: /map/<volume>/** → http://<container>:8100/**
 *
 * MCSM serves each server's BlueMap through its own domain (and TLS) by
 * proxying over the shared Docker network — no published ports, no extra
 * reverse proxy, no per-server domains. URLs are keyed by the world volume
 * name, the only identifier that survives container recreation on edits.
 *
 * This is a Nitro server route (server/routes/), so it takes precedence over
 * the SPA for /map/* paths.
 */

/** Volume names are sanitized to this shape at provision time. */
const SAFE_VOLUME = /^[a-z0-9-]+$/;

type ResolvedTarget = {
  containerName: string;
  running: boolean;
  bluemap: boolean;
};

// Tile loads burst into hundreds of requests — resolve volume → container via
// the Docker API at most once per TTL, and cache misses too.
const CACHE_TTL_MS = 10_000;
const cache = new Map<string, { at: number; target: ResolvedTarget | null }>();

async function resolveTarget(
  volume: string
): Promise<ResolvedTarget | null> {
  const cached = cache.get(volume);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.target;

  const { listServers, getServer } = useDocker();
  const servers = await listServers();

  let target: ResolvedTarget | null = null;
  for (const server of servers) {
    // Only servers that even have BlueMap enabled are inspect-worthy.
    if (!server.config?.BLUEMAP) continue;
    const detail = await getServer(server.id);
    if (detail.volume !== volume || !detail.containerName) continue;
    target = {
      containerName: detail.containerName,
      running: detail.running,
      bluemap: true,
    };
    break;
  }

  cache.set(volume, { at: Date.now(), target });
  return target;
}

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, "path") ?? "";
  const [volume = "", ...rest] = raw.split("/");

  if (!SAFE_VOLUME.test(volume)) {
    throw createError({ statusCode: 404, statusMessage: "Unknown map" });
  }

  // BlueMap's webapp uses relative URLs, so the map root must end in a slash:
  // /map/mc-smp → /map/mc-smp/
  if (rest.length === 0 && !event.path.endsWith("/")) {
    return sendRedirect(event, `/map/${volume}/`, 301);
  }

  const target = await resolveTarget(volume);
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: "Unknown map" });
  }
  if (!target.running) {
    throw createError({
      statusCode: 503,
      statusMessage: "Server is not running",
    });
  }

  const path = rest.join("/");
  const query = getRequestURL(event).search;
  return proxyRequest(
    event,
    `http://${target.containerName}:${BLUEMAP_PORT}/${path}${query}`
  );
});
