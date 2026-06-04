/**
 * Mod/plugin jar and config file locations per server type.
 *
 * This is the single source of truth for where jars and editable config files
 * live inside a server's /data volume, shared by the jar manager and the
 * config editor.
 */

/**
 * Server types that can load custom jars. VANILLA has no loader; FTBA's
 * installer owns its files (manual changes get clobbered on sync).
 */
export const JAR_SUPPORTED_TYPES = [
  "PAPER",
  "FABRIC",
  "FORGE",
  "AUTO_CURSEFORGE",
] as const;

export function serverTypeSupportsJars(type?: string | null): boolean {
  return (JAR_SUPPORTED_TYPES as readonly string[]).includes(type ?? "");
}

/**
 * Directory (relative to /data) where jars are installed: Bukkit-family
 * servers load plugins/, mod loaders load mods/. Null for unsupported types.
 */
export function jarsDir(type?: string | null): "plugins" | "mods" | null {
  if (!serverTypeSupportsJars(type)) return null;
  return type === "PAPER" ? "plugins" : "mods";
}

/**
 * World folder names are interpolated into the helper container's `find`
 * command, so they must stay shell-safe. Mirrors the check in world/reset.
 */
const SAFE_LEVEL = /^[A-Za-z0-9 _.-]+$/;

/**
 * The active world's per-world server config folder (relative to /data), or
 * null if the world name isn't shell-safe. Forge/NeoForge copy each mod's
 * `*-server.toml` from defaultconfigs/ into `<level>/serverconfig` the first
 * time a world is created, and that copy — not defaultconfigs/ — is what the
 * running world actually reads. `level` defaults to "world" (itzg's default
 * when LEVEL is unset).
 */
export function worldServerConfigRoot(level?: string | null): string | null {
  const name = (level || "world").trim();
  if (!SAFE_LEVEL.test(name)) return null;
  return `${name}/serverconfig`;
}

/**
 * Directory roots (relative to /data) whose files are editable in the config
 * editor: plugin configs live next to the jars; mod configs live in config/,
 * plus the active world's serverconfig/ (Forge/NeoForge per-world configs).
 */
export function configRoots(
  type?: string | null,
  level?: string | null
): string[] {
  if (!serverTypeSupportsJars(type)) return [];
  if (type === "PAPER") return ["plugins"];

  const roots = ["config"];
  const worldServerConfig = worldServerConfigRoot(level);
  if (worldServerConfig) roots.push(worldServerConfig);
  return roots;
}

/**
 * Root-level files (directly in /data) that are also editable — server configs
 * like bukkit.yml, spigot.yml, paper-global.yml. Matched by extension.
 * server.properties is intentionally NOT editable: itzg regenerates it from
 * env vars on every start, so edits there would be silently lost.
 */
export const ROOT_CONFIG_EXTENSIONS = [".yml", ".yaml", ".toml"] as const;

/**
 * Detect a CurseForge modpack's mod loader from markers the installer leaves
 * in the volume. The loader never changes for a modpack, so results are
 * cached per volume for the process lifetime. Returns null when the modpack
 * hasn't installed yet (first boot still running).
 */
const loaderCache = new Map<string, "fabric" | "forge" | "neoforge">();

export async function detectLoader(
  id: string,
  volume: string | null | undefined
): Promise<"fabric" | "forge" | "neoforge" | null> {
  if (volume && loaderCache.has(volume)) return loaderCache.get(volume)!;

  const out = await runInVolume(
    id,
    // Ordered checks; first match wins.
    `if [ -d /data/libraries/net/neoforged ]; then echo neoforge; ` +
      `elif [ -d /data/libraries/net/minecraftforge ]; then echo forge; ` +
      `elif [ -f /data/fabric-server-launch.jar ] || [ -d /data/libraries/net/fabricmc ]; then echo fabric; fi`
  );

  const detected = out.trim().split("\n").pop()?.trim();
  if (detected === "fabric" || detected === "forge" || detected === "neoforge") {
    if (volume) loaderCache.set(volume, detected);
    return detected;
  }
  return null;
}
