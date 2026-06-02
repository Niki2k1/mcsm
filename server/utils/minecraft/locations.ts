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
 * Directory roots (relative to /data) whose files are editable in the config
 * editor: plugin configs live next to the jars; mod configs live in config/.
 */
export function configRoots(type?: string | null): string[] {
  if (!serverTypeSupportsJars(type)) return [];
  return type === "PAPER" ? ["plugins"] : ["config"];
}

/**
 * Root-level files (directly in /data) that are also editable — server configs
 * like bukkit.yml, spigot.yml, paper-global.yml. Matched by extension.
 * server.properties is intentionally NOT editable: itzg regenerates it from
 * env vars on every start, so edits there would be silently lost.
 */
export const ROOT_CONFIG_EXTENSIONS = [".yml", ".yaml", ".toml"] as const;
