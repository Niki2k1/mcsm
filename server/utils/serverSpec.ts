import type { ServerConfig } from "../schema/server.schema";

export const MC_PORT = 25565;

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
 */
export function buildServerSpec(data: ServerConfig) {
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
  };

  if (data.HARDCORE) env.HARDCORE = "true";
  if (data.LEVEL !== "world") env.LEVEL = data.LEVEL;
  if (data.FTB_MODPACK_ID) env.FTB_MODPACK_ID = data.FTB_MODPACK_ID;
  if (data.FTB_MODPACK_VERSION_ID)
    env.FTB_MODPACK_VERSION_ID = data.FTB_MODPACK_VERSION_ID;
  if (data.CF_SLUG) env.CF_SLUG = data.CF_SLUG;
  if (data.CF_API_KEY) env.CF_API_KEY = data.CF_API_KEY;
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

  return {
    name: `mc-${subdomain}`,
    volume: `mc-${subdomain}`,
    domain,
    env,
    labels,
    memoryBytes: memory.limitBytes,
    port: MC_PORT,
  };
}
