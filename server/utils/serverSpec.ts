import type { H3Event } from "h3";
import type { ServerConfig } from "../schema/server.schema";
import type { ActivityAction } from "./activity";
import {
  activeVoicePort,
  pickVoicePort,
  serverTypeSupportsVoiceChat,
  VOICE_CHAT_SLUG,
  voiceChatConfigPath,
  VoicePortConflictError,
} from "#shared/utils/voiceChat";

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
  // Older configs leave this null ("on when the wizard whitelist has
  // entries"). Pin it, since the seed list no longer reflects the live one.
  data = {
    ...data,
    ENABLE_WHITELIST: data.ENABLE_WHITELIST ?? data.whitelist.length > 0,
  };
  const subdomain = sanitize(data.subdomain ?? data.name);
  const domain = `${subdomain}.${data.domain}`;
  const memory = parseMemory(data.memory);
  const hostPort = data.hostPort ?? undefined;

  // Custom env vars go in first so the managed assignments below always win
  // on conflicts — users can't override RCON access, the EULA, the type, etc.
  const env: Record<string, string> = {};
  for (const { key, value } of data.customEnv ?? []) {
    if (key) env[key.toUpperCase()] = value;
  }

  Object.assign(env, {
    // Accepted by the user in the create dialog (enforced by create.post.ts).
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
  // The wizard's lists only seed a new world: SKIP leaves an existing
  // ops.json / whitelist.json alone, so changes made on the Players tab
  // survive every recreate instead of being merged back with stale lists.
  // Names, not UUIDs: given a bare UUID itzg writes the entry with an empty
  // name, which the Players tab couldn't display.
  if (data.operators.length > 0) {
    env.OPS = data.operators.map((user) => user.name).join(",");
    env.EXISTING_OPS_FILE = "SKIP";
  }
  if (data.whitelist.length > 0) {
    env.WHITELIST = data.whitelist.map((user) => user.name).join(",");
    env.EXISTING_WHITELIST_FILE = "SKIP";
  }
  if (data.VERSION) env.VERSION = data.VERSION.label;

  // --- Gameplay --------------------------------------------------------------
  env.MODE = data.MODE ?? "survival";
  env.PVP = String(data.PVP ?? true);
  if (data.SEED) env.SEED = data.SEED;
  if (data.LEVEL_TYPE && data.LEVEL_TYPE !== "minecraft:normal")
    env.LEVEL_TYPE = data.LEVEL_TYPE;
  env.SPAWN_PROTECTION = String(data.SPAWN_PROTECTION ?? 16);
  if (data.ENABLE_COMMAND_BLOCK) env.ENABLE_COMMAND_BLOCK = "true";
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
  let modrinthProjects = data.MODRINTH_PROJECTS;
  if (data.BLUEMAP && serverTypeSupportsBluemap(data.type))
    modrinthProjects = addModrinthProject(modrinthProjects, BLUEMAP_SLUG);
  const voicePort = activeVoicePort(data);
  if (voicePort)
    modrinthProjects = addModrinthProject(modrinthProjects, VOICE_CHAT_SLUG);
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

  // Older Minecraft/modpacks need older Java — the itzg image variant tag
  // selects the JVM. The base image (and registry) stays configurable.
  const baseImage = config.docker?.image || "itzg/minecraft-server";
  const image =
    data.JAVA_VERSION && data.JAVA_VERSION !== "latest"
      ? `${baseImage.split(":")[0]}:${data.JAVA_VERSION}`
      : baseImage;

  return {
    name: `mc-${subdomain}`,
    volume: `mc-${subdomain}`,
    domain,
    env,
    labels,
    image,
    memoryBytes: memory.limitBytes,
    hostPort,
    port: MC_PORT,
    voiceChat: voicePort
      ? { port: voicePort, configPath: voiceChatConfigPath(data.type) }
      : undefined,
    // Auto-stop exits the container on purpose — "unless-stopped" would
    // immediately start it again and defeat the feature.
    restartPolicy: data.IDLE_BEHAVIOR === "stop" ? "no" : "unless-stopped",
  };
}

/**
 * Fill in the voice port for a config that enables voice chat, checked against
 * the ports of every other MCSM server on the host (read from their stored
 * configs). Rejects a requested port that is already taken with a 409.
 */
export async function assignVoicePort(
  event: H3Event | undefined,
  data: ServerConfig,
  options: { excludeId?: string; previous?: number | null } = {}
): Promise<ServerConfig> {
  if (!data.VOICE_CHAT || !serverTypeSupportsVoiceChat(data.type)) return data;

  const servers = await useDocker(event).listServers();
  const used = servers
    .filter((server) => server.id !== options.excludeId)
    .map((server) => activeVoicePort(server.config))
    .filter((port): port is number => port !== null);

  try {
    const voicePort = pickVoicePort({
      requested: data.voicePort,
      previous: options.previous,
      used,
    });
    return { ...data, voicePort };
  } catch (error) {
    if (error instanceof VoicePortConflictError) {
      throw createError({ statusCode: 409, statusMessage: error.message });
    }
    throw error;
  }
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
  activityDetail: string,
  action: ActivityAction = "edited",
  volumeSource?: string
) {
  const { getServer, removeServer, provisionServer } = useDocker(event);

  const existing = await getServer(serverId);
  data = await assignVoicePort(event, data, {
    excludeId: existing.id,
    previous: existing.config?.voicePort,
  });
  const spec = await buildServerSpec(data, event);

  // Reuse the original container name and volume so the world survives even
  // if the display name / subdomain changed.
  const name = existing.containerName || spec.name;
  const volume = existing.volume || spec.volume;

  await removeServer(serverId, { removeVolume: false });

  const container = await provisionServer({
    name,
    image: spec.image,
    env: spec.env,
    labels: spec.labels,
    memoryBytes: spec.memoryBytes,
    port: spec.port,
    hostPort: spec.hostPort,
    voiceChat: spec.voiceChat,
    volume,
    volumeSource: volumeSource ?? existing.volumeSource ?? undefined,
    restartPolicy: spec.restartPolicy,
  });

  await recordActivity(volume, action, activityDetail);

  return {
    id: container.id,
    name: container.name,
    domain: spec.domain,
    volume,
  };
}
