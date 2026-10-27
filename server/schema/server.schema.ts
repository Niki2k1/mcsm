import * as v from "valibot";

/** Custom env vars users can add on top of the managed fields. */
export const customEnvSchema = v.array(
  v.object({
    // Standard env var naming; also blocks shell/RCON injection vectors.
    key: v.pipe(v.string(), v.regex(/^[A-Za-z_][A-Za-z0-9_]*$/)),
    value: v.pipe(v.string(), v.maxLength(4096)),
  })
);

/**
 * The full configuration for a Minecraft server.
 *
 * Fields added after the initial release carry `.default()` values so configs
 * stored by older versions (read back from the `mcsm.config` Docker label)
 * still validate when they are re-submitted on edit.
 */
export const serverConfigSchema = v.object({
  type: v.picklist([
    "VANILLA",
    "FTBA",
    "AUTO_CURSEFORGE",
    "PAPER",
    "FABRIC",
    "FORGE",
    "NEOFORGE",
  ]),
  name: v.string(),
  domain: v.string(),
  subdomain: v.nullable(v.string()),
  hostPort: v.nullish(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535)),
    null
  ),
  // Older configs stored minecraft-data's numeric version id as the value;
  // newer ones use the Mojang version id string. Only the label is used.
  VERSION: v.nullable(
    v.object({
      label: v.string(),
      value: v.union([v.string(), v.number()]),
    })
  ),
  /** Heap size, e.g. "2GB", "6GB", "16GB". */
  memory: v.pipe(v.string(), v.regex(/^\d+GB$/i)),
  MOTD: v.string(),
  DIFFICULTY: v.string(),
  MAX_PLAYERS: v.number(),
  ONLINE_MODE: v.boolean(),
  ALLOW_FLIGHT: v.boolean(),
  operators: v.array(v.object({ name: v.string(), uuid: v.string() })),
  whitelist: v.array(v.object({ name: v.string(), uuid: v.string() })),
  HARDCORE: v.boolean(),
  LEVEL: v.string(),
  FTB_MODPACK_ID: v.nullable(v.string()),
  FTB_MODPACK_VERSION_ID: v.nullable(v.string()),
  CF_SLUG: v.nullable(v.string()),
  CF_API_KEY: v.nullable(v.string()),
  CF_FILE_ID: v.nullable(v.string()),

  // --- Gameplay --------------------------------------------------------------
  MODE: v.optional(
    v.picklist(["survival", "creative", "adventure", "spectator"]),
    "survival"
  ),
  /** World seed — only affects newly generated worlds. */
  SEED: v.nullish(v.pipe(v.string(), v.maxLength(100)), null),
  PVP: v.optional(v.boolean(), true),
  LEVEL_TYPE: v.optional(
    v.picklist([
      "minecraft:normal",
      "minecraft:flat",
      "minecraft:large_biomes",
      "minecraft:amplified",
      "minecraft:single_biome_surface",
    ]),
    "minecraft:normal"
  ),
  SPAWN_PROTECTION: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000)),
    16
  ),
  ENABLE_COMMAND_BLOCK: v.optional(v.boolean(), false),
  /**
   * Whitelist on/off for a new world only; `null` = on when the whitelist
   * has entries. Afterwards the switches live in the server's own
   * server.properties and are changed on the Players tab.
   */
  ENABLE_WHITELIST: v.nullish(v.boolean(), null),
  /** Unused: itzg always enforces a seeded whitelist. Kept so old configs parse. */
  ENFORCE_WHITELIST: v.optional(v.boolean(), false),

  /**
   * itzg image Java variant — old Minecraft/modpacks need old Java:
   * ≤1.16 → java8, 1.17–1.20.4 → java17, 1.20.5+ → java21/latest.
   */
  JAVA_VERSION: v.optional(
    v.picklist(["latest", "java21", "java17", "java11", "java8-multiarch"]),
    "latest"
  ),

  // --- Performance & cost ------------------------------------------------------
  VIEW_DISTANCE: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(32)),
    10
  ),
  SIMULATION_DISTANCE: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(32)),
    10
  ),
  /** Kick players idle for this many minutes (0 = never). */
  PLAYER_IDLE_TIMEOUT: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0)),
    0
  ),
  /** Aikar's well-tested JVM GC flags. */
  USE_AIKAR_FLAGS: v.optional(v.boolean(), false),
  /**
   * What to do when nobody is online: pause the JVM (near-zero CPU, instant
   * wake on connect) or stop the container entirely. Mutually exclusive
   * behaviours of the itzg image, hence one field.
   */
  IDLE_BEHAVIOR: v.optional(v.picklist(["none", "pause", "stop"]), "none"),
  /** Seconds without players before the idle behaviour kicks in. */
  IDLE_TIMEOUT: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(60)),
    3600
  ),

  // --- Presentation & QoL -------------------------------------------------------
  /** URL of a 64x64 server icon. */
  ICON: v.nullish(v.string(), null),
  RESOURCE_PACK: v.nullish(v.string(), null),
  /** SHA1 of the pack — clients re-download when it changes. Auto-set on upload. */
  RESOURCE_PACK_SHA1: v.nullish(v.string(), null),
  RESOURCE_PACK_ENFORCE: v.optional(v.boolean(), false),
  HIDE_ONLINE_PLAYERS: v.optional(v.boolean(), false),
  /** Container timezone, e.g. Europe/Berlin (affects log timestamps). */
  TZ: v.nullish(v.string(), null),
  SPAWN_ANIMALS: v.optional(v.boolean(), true),
  SPAWN_MONSTERS: v.optional(v.boolean(), true),
  SPAWN_NPCS: v.optional(v.boolean(), true),
  ALLOW_NETHER: v.optional(v.boolean(), true),
  GENERATE_STRUCTURES: v.optional(v.boolean(), true),

  // --- Integrations ----------------------------------------------------------------
  /**
   * BlueMap 3D web map (https://bluemap.bluecolored.de). Auto-installed from
   * Modrinth and served through MCSM at /map/<volume>/. Only applies to
   * plugin/mod-capable types (Paper/Fabric/Forge/NeoForge).
   */
  BLUEMAP: v.optional(v.boolean(), false),
  /**
   * Simple Voice Chat, auto-installed from Modrinth. Needs its own UDP port
   * published on the host because Infrarust only proxies TCP.
   */
  VOICE_CHAT: v.optional(v.boolean(), false),
  /**
   * Host (and container) UDP port for voice chat. `null` lets MCSM assign a
   * free one; the assigned port is stored so recreates keep it.
   */
  voicePort: v.nullish(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535)),
    null
  ),

  // --- Advanced -------------------------------------------------------------------
  /** Comma/newline-separated Modrinth project slugs to install (mods/plugins). */
  MODRINTH_PROJECTS: v.nullish(v.string(), null),
  /** Comma-separated SpigotMC resource IDs to install (Paper/Spigot only). */
  SPIGET_RESOURCES: v.nullish(v.string(), null),
  /** Newline-delimited raw server.properties entries. */
  CUSTOM_SERVER_PROPERTIES: v.nullish(
    v.pipe(v.string(), v.maxLength(8192)),
    null
  ),
  /** Free-form env vars passed to the container (managed keys always win). */
  customEnv: v.optional(customEnvSchema, []),
});

export type ServerConfig = v.InferOutput<typeof serverConfigSchema>;
