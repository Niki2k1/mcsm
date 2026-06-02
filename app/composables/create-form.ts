export type CreateForm = {
  type: string | null;
  name: string | null;
  domain: string | null;
  subdomain: string | null;
  /** Minecraft version as the option object the version select works with. */
  VERSION: { label: string; value: number } | null;
  memory: string | null;
  MOTD: string;
  DIFFICULTY: "peaceful" | "easy" | "normal" | "hard";
  HARDCORE: boolean;
  MAX_PLAYERS: number;
  ONLINE_MODE: boolean;
  ALLOW_FLIGHT: boolean;
  operators: { name: string; uuid: string }[];
  whitelist: { name: string; uuid: string }[];
  LEVEL: string;
  FTB_MODPACK_ID: string | null;
  FTB_MODPACK_VERSION_ID: string | null;
  CF_SLUG: string | null;
  CF_API_KEY: string | null;
  CF_FILE_ID: string | null;

  // Gameplay
  MODE: "survival" | "creative" | "adventure" | "spectator";
  /** World seed — only affects newly generated worlds. */
  SEED: string | null;
  PVP: boolean;
  LEVEL_TYPE:
    | "minecraft:normal"
    | "minecraft:flat"
    | "minecraft:large_biomes"
    | "minecraft:amplified"
    | "minecraft:single_biome_surface";
  SPAWN_PROTECTION: number;
  ENABLE_COMMAND_BLOCK: boolean;
  /** null = automatic (itzg enables whitelisting when the list has entries). */
  ENABLE_WHITELIST: boolean | null;
  ENFORCE_WHITELIST: boolean;

  /** itzg image Java variant — old Minecraft/modpacks need old Java. */
  JAVA_VERSION: "latest" | "java21" | "java17" | "java11" | "java8-multiarch";

  // Performance & cost
  VIEW_DISTANCE: number;
  SIMULATION_DISTANCE: number;
  PLAYER_IDLE_TIMEOUT: number;
  USE_AIKAR_FLAGS: boolean;
  IDLE_BEHAVIOR: "none" | "pause" | "stop";
  IDLE_TIMEOUT: number;

  // Presentation & QoL
  ICON: string | null;
  RESOURCE_PACK: string | null;
  RESOURCE_PACK_SHA1: string | null;
  RESOURCE_PACK_ENFORCE: boolean;
  HIDE_ONLINE_PLAYERS: boolean;
  TZ: string | null;
  SPAWN_ANIMALS: boolean;
  SPAWN_MONSTERS: boolean;
  SPAWN_NPCS: boolean;
  ALLOW_NETHER: boolean;
  GENERATE_STRUCTURES: boolean;

  // Integrations
  /** BlueMap 3D web map (Paper/Fabric/Forge only). */
  BLUEMAP: boolean;

  // Advanced
  MODRINTH_PROJECTS: string | null;
  SPIGET_RESOURCES: string | null;
  CUSTOM_SERVER_PROPERTIES: string | null;
  /** Free-form env vars passed to the container (managed keys always win). */
  customEnv: { key: string; value: string }[];
};

export const defaultCreateForm = (): CreateForm => ({
  type: null,
  name: null,
  domain: null,
  subdomain: null,
  VERSION: null,
  memory: "2GB",
  MOTD: "",
  DIFFICULTY: "normal",
  MAX_PLAYERS: 20,
  ONLINE_MODE: true,
  ALLOW_FLIGHT: false,
  operators: [],
  whitelist: [],
  HARDCORE: false,
  LEVEL: "world",
  FTB_MODPACK_ID: null,
  FTB_MODPACK_VERSION_ID: null,
  CF_SLUG: null,
  CF_API_KEY: null,
  CF_FILE_ID: null,

  // Gameplay
  MODE: "survival",
  SEED: null,
  PVP: true,
  LEVEL_TYPE: "minecraft:normal",
  SPAWN_PROTECTION: 16,
  ENABLE_COMMAND_BLOCK: false,
  ENABLE_WHITELIST: null,
  ENFORCE_WHITELIST: false,

  JAVA_VERSION: "latest",

  // Performance & cost
  VIEW_DISTANCE: 10,
  SIMULATION_DISTANCE: 10,
  PLAYER_IDLE_TIMEOUT: 0,
  USE_AIKAR_FLAGS: false,
  IDLE_BEHAVIOR: "none",
  IDLE_TIMEOUT: 3600,

  // Presentation & QoL
  ICON: null,
  RESOURCE_PACK: null,
  RESOURCE_PACK_SHA1: null,
  RESOURCE_PACK_ENFORCE: false,
  HIDE_ONLINE_PLAYERS: false,
  TZ: null,
  SPAWN_ANIMALS: true,
  SPAWN_MONSTERS: true,
  SPAWN_NPCS: true,
  ALLOW_NETHER: true,
  GENERATE_STRUCTURES: true,

  // Integrations
  BLUEMAP: false,

  // Advanced
  MODRINTH_PROJECTS: null,
  SPIGET_RESOURCES: null,
  CUSTOM_SERVER_PROPERTIES: null,
  customEnv: [],
});

export const useCreateForm = () => {
  return useState<CreateForm>("form", () => defaultCreateForm());
};

/** Reset the shared form to defaults (create) or to an existing config (edit). */
export const setCreateForm = (initial?: Partial<CreateForm> | null) => {
  const form = useCreateForm();
  form.value = { ...defaultCreateForm(), ...(initial ?? {}) };
};
