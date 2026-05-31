import type { ServerConfig } from "../schema/server.schema";

export const MC_PORT = 25565;
/** Port BlueMap's integrated webserver listens on inside the container. */
export const BLUEMAP_WEB_PORT = 8100;
/** Server types BlueMap can be installed on (plugin/mod loaders). */
export const BLUEMAP_TYPES = ["PAPER", "FABRIC", "FORGE"] as const;

/** "2GB" -> { heap: "2G", limitBytes: 3 GiB } (heap + 1 GiB headroom). */
export function parseMemory(memory: string) {
  const gb = parseInt(memory, 10) || 2;
  return {
    heap: `${gb}G`,
    limitBytes: (gb + 1) * 1024 ** 3,
  };
}

/** Make a value safe to use as a Docker container/volume name. */
export function sanitize(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Translate a wizard config into the concrete container spec: env vars for the
 * itzg image, the Infrarust routing labels, plus the full config stashed as a
 * JSON label so it can be read back for editing (Docker is the source of
 * truth — no database).
 *
 * Global secrets (e.g. the CurseForge API key) are pulled from the central
 * store rather than the per-server config, so they're set once and applied to
 * every container that needs them.
 */
export async function buildServerSpec(data: ServerConfig) {
  const config = useRuntimeConfig();
  const secrets = await useSecrets().getAll();
  const subdomain = sanitize(data.subdomain ?? data.name);
  const domain = `${subdomain}.${data.domain}`;
  const memory = parseMemory(data.memory);

  const env: Record<string, string> = {
    EULA: "true",
    TYPE: data.type,
    MEMORY: memory.heap,
    MOTD: data.MOTD,
    DIFFICULTY: data.DIFFICULTY,
    MAX_PLAYERS: data.MAX_PLAYERS.toString(),
    ONLINE_MODE: data.ONLINE_MODE.toString(),
    ALLOW_FLIGHT: data.ALLOW_FLIGHT.toString(),
    // RCON for the in-app console. Only reachable on the internal Docker
    // network (the port is never published), so MCSM can run commands.
    ENABLE_RCON: "true",
    RCON_PORT: String(config.rcon?.port ?? 25575),
    RCON_PASSWORD: config.rcon?.password ?? "minecraft",
  };

  if (data.HARDCORE) env.HARDCORE = "true";
  if (data.LEVEL !== "world") env.LEVEL = data.LEVEL;
  if (data.FTB_MODPACK_ID) env.FTB_MODPACK_ID = data.FTB_MODPACK_ID;
  if (data.FTB_MODPACK_VERSION_ID)
    env.FTB_MODPACK_VERSION_ID = data.FTB_MODPACK_VERSION_ID;
  if (data.CF_SLUG) env.CF_SLUG = data.CF_SLUG;
  // CurseForge API key comes from the global secret store (fall back to any
  // legacy per-server value for backwards compatibility).
  const cfApiKey = secrets.CURSEFORGE_API_KEY || data.CF_API_KEY;
  if (cfApiKey) env.CF_API_KEY = cfApiKey;
  if (data.CF_FILE_ID) env.CF_FILE_ID = data.CF_FILE_ID;
  if (data.operators.length > 0)
    env.OPERATORS = data.operators.map((user) => user.uuid).join(",");
  if (data.whitelist.length > 0)
    env.WHITELIST = data.whitelist.map((user) => user.uuid).join(",");
  if (data.VERSION) env.VERSION = data.VERSION.label;

  const labels: Record<string, string> = {
    // MCSM ownership + config store
    "mcsm.managed": "true",
    "mcsm.name": data.name,
    "mcsm.config": JSON.stringify(data),
    // Infrarust routing (discovered from the Docker socket)
    "infrarust.enable": "true",
    "infrarust.domains": domain,
    "infrarust.port": MC_PORT.toString(),
    "infrarust.proxy_mode": "passthrough",
  };

  // BlueMap: let the itzg image auto-install the right jar for the loader from
  // Modrinth, then publish its webserver to the host so the 3D map is reachable
  // (Infrarust only proxies the Minecraft protocol, not HTTP).
  const bluemapEnabled =
    data.BLUEMAP && (BLUEMAP_TYPES as readonly string[]).includes(data.type);
  let bluemap: { hostPort: number; containerPort: number } | undefined;

  if (bluemapEnabled) {
    const projects = (env.MODRINTH_PROJECTS ?? "")
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean);
    if (!projects.includes("bluemap")) projects.push("bluemap");
    env.MODRINTH_PROJECTS = projects.join(",");

    const hostPort = data.BLUEMAP_PORT || BLUEMAP_WEB_PORT;
    bluemap = { hostPort, containerPort: BLUEMAP_WEB_PORT };
    labels["mcsm.bluemap"] = "true";
    labels["mcsm.bluemap.port"] = String(hostPort);
  }

  return {
    name: `mc-${subdomain}`,
    volume: `mc-${subdomain}`,
    domain,
    env,
    labels,
    memoryBytes: memory.limitBytes,
    port: MC_PORT,
    bluemap,
  };
}
