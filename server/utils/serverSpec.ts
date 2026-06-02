import type { H3Event } from "h3";
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
 *
 * Global secrets (e.g. the CurseForge API key) are pulled from the central
 * store rather than the per-server config, so they're set once and applied to
 * every container that needs them.
 */
export async function buildServerSpec(data: ServerConfig, event?: H3Event) {
  const config = useRuntimeConfig(event);
  const secrets = await useSecrets().getAll();
  const subdomain = sanitize(data.subdomain ?? data.name);
  const domain = `${subdomain}.${data.domain}`;
  const memory = parseMemory(data.memory);

  // Custom env vars go in first so the managed assignments below always win
  // on conflicts — users can't override RCON access, the EULA, the type, etc.
  const env: Record<string, string> = {};
  for (const { key, value } of data.customEnv ?? []) {
    if (key) env[key.toUpperCase()] = value;
  }

  Object.assign(env, {
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
  });

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

  // --- Gameplay --------------------------------------------------------------
  env.MODE = data.MODE ?? "survival";
  env.PVP = String(data.PVP ?? true);
  if (data.SEED) env.SEED = data.SEED;
  if (data.LEVEL_TYPE && data.LEVEL_TYPE !== "minecraft:normal")
    env.LEVEL_TYPE = data.LEVEL_TYPE;
  env.SPAWN_PROTECTION = String(data.SPAWN_PROTECTION ?? 16);
  if (data.ENABLE_COMMAND_BLOCK) env.ENABLE_COMMAND_BLOCK = "true";
  // null = let itzg decide (it enables whitelisting when WHITELIST is set);
  // an explicit value always wins.
  if (data.ENABLE_WHITELIST !== null && data.ENABLE_WHITELIST !== undefined)
    env.ENABLE_WHITELIST = String(data.ENABLE_WHITELIST);
  if (data.ENFORCE_WHITELIST) env.ENFORCE_WHITELIST = "true";

  // --- Performance & cost ------------------------------------------------------
  env.VIEW_DISTANCE = String(data.VIEW_DISTANCE ?? 10);
  env.SIMULATION_DISTANCE = String(data.SIMULATION_DISTANCE ?? 10);
  if (data.PLAYER_IDLE_TIMEOUT)
    env.PLAYER_IDLE_TIMEOUT = String(data.PLAYER_IDLE_TIMEOUT);
  if (data.USE_AIKAR_FLAGS) env.USE_AIKAR_FLAGS = "true";

  // Idle behaviour: pause the JVM or stop the container when nobody plays.
  // The two are mutually exclusive in the itzg image.
  const idleTimeout = String(data.IDLE_TIMEOUT ?? 3600);
  if (data.IDLE_BEHAVIOR === "pause") {
    env.ENABLE_AUTOPAUSE = "true";
    env.AUTOPAUSE_TIMEOUT_EST = idleTimeout;
    // Required for autopause: the watchdog would kill the paused process.
    env.MAX_TICK_TIME = "-1";
  } else if (data.IDLE_BEHAVIOR === "stop") {
    env.ENABLE_AUTOSTOP = "true";
    env.AUTOSTOP_TIMEOUT_EST = idleTimeout;
  }

  // --- Presentation & QoL -------------------------------------------------------
  if (data.ICON) {
    // Icons hosted by MCSM itself must be fetched via MCSM's *internal* Docker
    // hostname — the Minecraft container can't reach the public domain (NAT
    // hairpin from inside the network times out). External URLs pass through.
    const selfHostedPath =
      data.ICON.match(/\/api\/icons\/[A-Za-z0-9._-]+$/)?.[0] ??
      (data.ICON.startsWith("/") ? data.ICON : null);
    env.ICON = selfHostedPath
      ? `${config.internalUrl || "http://mcsm:3000"}${selfHostedPath}`
      : data.ICON;
    // Without this, itzg only applies ICON when the volume has no
    // server-icon.png yet — icon changes would never take effect.
    env.OVERRIDE_ICON = "TRUE";
  }
  if (data.RESOURCE_PACK) {
    env.RESOURCE_PACK = data.RESOURCE_PACK;
    if (data.RESOURCE_PACK_SHA1)
      env.RESOURCE_PACK_SHA1 = data.RESOURCE_PACK_SHA1;
    if (data.RESOURCE_PACK_ENFORCE) env.RESOURCE_PACK_ENFORCE = "true";
  }
  if (data.HIDE_ONLINE_PLAYERS) env.HIDE_ONLINE_PLAYERS = "true";
  if (data.TZ) env.TZ = data.TZ;
  env.SPAWN_ANIMALS = String(data.SPAWN_ANIMALS ?? true);
  env.SPAWN_MONSTERS = String(data.SPAWN_MONSTERS ?? true);
  env.SPAWN_NPCS = String(data.SPAWN_NPCS ?? true);
  env.ALLOW_NETHER = String(data.ALLOW_NETHER ?? true);
  env.GENERATE_STRUCTURES = String(data.GENERATE_STRUCTURES ?? true);

  // --- Advanced -------------------------------------------------------------------
  // BlueMap is installed via Modrinth like any other project, merged into the
  // user's own MODRINTH_PROJECTS list so the two never clobber each other.
  const modrinthProjects =
    data.BLUEMAP && serverTypeSupportsBluemap(data.type)
      ? addModrinthProject(data.MODRINTH_PROJECTS, BLUEMAP_SLUG)
      : data.MODRINTH_PROJECTS;
  if (modrinthProjects) {
    env.MODRINTH_PROJECTS = modrinthProjects;
    // Auto-installed projects often have required dependencies — e.g. Chunky
    // and BlueMap on Fabric need fabric-api — so let the itzg image resolve
    // and download those too. A custom env var of the same name wins.
    env.MODRINTH_DOWNLOAD_DEPENDENCIES ||= "required";
  }
  if (data.SPIGET_RESOURCES) env.SPIGET_RESOURCES = data.SPIGET_RESOURCES;
  if (data.CUSTOM_SERVER_PROPERTIES)
    env.CUSTOM_SERVER_PROPERTIES = data.CUSTOM_SERVER_PROPERTIES;

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
    // Auto-stop exits the container on purpose — "unless-stopped" would
    // immediately start it again and defeat the feature.
    restartPolicy: data.IDLE_BEHAVIOR === "stop" ? "no" : "unless-stopped",
  };
}

/**
 * Recreate a server's container with a new config. Docker can't change env
 * vars or labels in place, so the old container is removed (keeping its
 * volume) and a fresh one is provisioned reusing the same name and volume —
 * the world and the server's identity survive.
 *
 * Used by the edit flow and by integrations (pre-generation, BlueMap) that
 * toggle config and need the container rebuilt.
 */
export async function recreateServer(
  event: H3Event | undefined,
  serverId: string,
  data: ServerConfig,
  activityDetail: string
) {
  const config = useRuntimeConfig(event);
  const { getServer, removeServer, provisionServer } = useDocker(event);

  const existing = await getServer(serverId);
  const spec = await buildServerSpec(data, event);

  // Reuse the original container name and volume so the world survives even
  // if the display name / subdomain changed.
  const name = existing.containerName || spec.name;
  const volume = existing.volume || spec.volume;

  await removeServer(serverId, { removeVolume: false });

  const container = await provisionServer({
    name,
    image: config.docker?.image || "itzg/minecraft-server",
    env: spec.env,
    labels: spec.labels,
    memoryBytes: spec.memoryBytes,
    port: spec.port,
    volume,
    restartPolicy: spec.restartPolicy,
  });

  await recordActivity(volume, "edited", activityDetail);

  return {
    id: container.id,
    name: container.name,
    domain: spec.domain,
    volume,
  };
}
