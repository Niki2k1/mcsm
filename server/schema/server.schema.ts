import { z } from "zod";

/** Custom env vars users can add on top of the managed fields. */
export const customEnvSchema = z.array(
  z.object({
    // Standard env var naming; also blocks shell/RCON injection vectors.
    key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    value: z.string().max(4096),
  })
);

/**
 * The full configuration for a Minecraft server.
 *
 * Fields added after the initial release carry `.default()` values so configs
 * stored by older versions (read back from the `mcsm.config` Docker label)
 * still validate when they are re-submitted on edit.
 */
export const serverConfigSchema = z.object({
  type: z.enum(["VANILLA", "FTBA", "AUTO_CURSEFORGE", "PAPER", "FABRIC", "FORGE"]),
  name: z.string(),
  domain: z.string(),
  subdomain: z.string().nullable(),
  VERSION: z
    .object({
      label: z.string(),
      value: z.number(),
    })
    .nullable(),
  /** Heap size, e.g. "2GB", "6GB", "16GB". */
  memory: z.string().regex(/^\d+GB$/i),
  MOTD: z.string(),
  DIFFICULTY: z.string(),
  MAX_PLAYERS: z.number(),
  ONLINE_MODE: z.boolean(),
  ALLOW_FLIGHT: z.boolean(),
  operators: z.array(z.object({ name: z.string(), uuid: z.string() })),
  whitelist: z.array(z.object({ name: z.string(), uuid: z.string() })),
  HARDCORE: z.boolean(),
  LEVEL: z.string(),
  FTB_MODPACK_ID: z.string().nullable(),
  FTB_MODPACK_VERSION_ID: z.string().nullable(),
  CF_SLUG: z.string().nullable(),
  CF_API_KEY: z.string().nullable(),
  CF_FILE_ID: z.string().nullable(),

  // --- Gameplay --------------------------------------------------------------
  MODE: z
    .enum(["survival", "creative", "adventure", "spectator"])
    .default("survival"),
  /** World seed — only affects newly generated worlds. */
  SEED: z.string().max(100).nullable().default(null),
  PVP: z.boolean().default(true),
  LEVEL_TYPE: z
    .enum([
      "minecraft:normal",
      "minecraft:flat",
      "minecraft:large_biomes",
      "minecraft:amplified",
      "minecraft:single_biome_surface",
    ])
    .default("minecraft:normal"),
  SPAWN_PROTECTION: z.number().int().min(0).max(1000).default(16),
  ENABLE_COMMAND_BLOCK: z.boolean().default(false),
  /**
   * Whitelist on/off. `null` keeps itzg's automatic behaviour (enabled when
   * the whitelist has entries) so configs from before this field existed
   * don't change behaviour.
   */
  ENABLE_WHITELIST: z.boolean().nullable().default(null),
  ENFORCE_WHITELIST: z.boolean().default(false),

  /**
   * itzg image Java variant — old Minecraft/modpacks need old Java:
   * ≤1.16 → java8, 1.17–1.20.4 → java17, 1.20.5+ → java21/latest.
   */
  JAVA_VERSION: z
    .enum(["latest", "java21", "java17", "java11", "java8-multiarch"])
    .default("latest"),

  // --- Performance & cost ------------------------------------------------------
  VIEW_DISTANCE: z.number().int().min(2).max(32).default(10),
  SIMULATION_DISTANCE: z.number().int().min(2).max(32).default(10),
  /** Kick players idle for this many minutes (0 = never). */
  PLAYER_IDLE_TIMEOUT: z.number().int().min(0).default(0),
  /** Aikar's well-tested JVM GC flags. */
  USE_AIKAR_FLAGS: z.boolean().default(false),
  /**
   * What to do when nobody is online: pause the JVM (near-zero CPU, instant
   * wake on connect) or stop the container entirely. Mutually exclusive
   * behaviours of the itzg image, hence one field.
   */
  IDLE_BEHAVIOR: z.enum(["none", "pause", "stop"]).default("none"),
  /** Seconds without players before the idle behaviour kicks in. */
  IDLE_TIMEOUT: z.number().int().min(60).default(3600),

  // --- Presentation & QoL -------------------------------------------------------
  /** URL of a 64x64 server icon. */
  ICON: z.string().nullable().default(null),
  RESOURCE_PACK: z.string().nullable().default(null),
  /** SHA1 of the pack — clients re-download when it changes. Auto-set on upload. */
  RESOURCE_PACK_SHA1: z.string().nullable().default(null),
  RESOURCE_PACK_ENFORCE: z.boolean().default(false),
  HIDE_ONLINE_PLAYERS: z.boolean().default(false),
  /** Container timezone, e.g. Europe/Berlin (affects log timestamps). */
  TZ: z.string().nullable().default(null),
  SPAWN_ANIMALS: z.boolean().default(true),
  SPAWN_MONSTERS: z.boolean().default(true),
  SPAWN_NPCS: z.boolean().default(true),
  ALLOW_NETHER: z.boolean().default(true),
  GENERATE_STRUCTURES: z.boolean().default(true),

  // --- Integrations ----------------------------------------------------------------
  /**
   * BlueMap 3D web map (https://bluemap.bluecolored.de). Auto-installed from
   * Modrinth and served through MCSM at /map/<volume>/. Only applies to
   * plugin/mod-capable types (Paper/Fabric/Forge).
   */
  BLUEMAP: z.boolean().default(false),

  // --- Advanced -------------------------------------------------------------------
  /** Comma/newline-separated Modrinth project slugs to install (mods/plugins). */
  MODRINTH_PROJECTS: z.string().nullable().default(null),
  /** Comma-separated SpigotMC resource IDs to install (Paper/Spigot only). */
  SPIGET_RESOURCES: z.string().nullable().default(null),
  /** Newline-delimited raw server.properties entries. */
  CUSTOM_SERVER_PROPERTIES: z.string().max(8192).nullable().default(null),
  /** Free-form env vars passed to the container (managed keys always win). */
  customEnv: customEnvSchema.default([]),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
