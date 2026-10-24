import { createHash } from "node:crypto";

/**
 * The server's own whitelist.json / ops.json are the single source of truth
 * for who may join and who is op. The wizard's lists only seed them once for a
 * new world (itzg runs with EXISTING_*_FILE=SKIP, see serverSpec.ts); after
 * that every change goes through these files — via RCON while the server runs
 * (Minecraft rewrites them itself), or written directly while it's stopped.
 */

export type PlayerListKind = "whitelist" | "ops";

export type PlayerListEntry = { uuid: string; name: string };

export type OpEntry = PlayerListEntry & {
  level: number;
  bypassesPlayerLimit: boolean;
};

const FILES: Record<PlayerListKind, string> = {
  whitelist: "whitelist.json",
  ops: "ops.json",
};

// Player lists are tiny; anything bigger is not a list we should be parsing.
const MAX_LIST_BYTES = 512 * 1024;

/** Parse a whitelist.json / ops.json, tolerating a missing or broken file. */
export function parsePlayerList(raw: string | null): PlayerListEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PlayerListEntry =>
        typeof entry?.name === "string" && typeof entry?.uuid === "string"
    );
  } catch {
    return [];
  }
}

/** Add or remove a player, matching by UUID or (case-insensitive) name. */
export function updatePlayerList<T extends PlayerListEntry>(
  list: T[],
  op: "add" | "remove",
  entry: T
): T[] {
  const same = (other: PlayerListEntry) =>
    other.uuid === entry.uuid ||
    other.name.toLowerCase() === entry.name.toLowerCase();
  const rest = list.filter((other) => !same(other));
  return op === "add" ? [...rest, entry] : rest;
}

/** Mojang's undashed id → the dashed form Minecraft writes to its files. */
export function dashUuid(id: string): string {
  const hex = id.replace(/-/g, "").toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The UUID an offline-mode server assigns: a v3 UUID of "OfflinePlayer:<name>",
 * same as Java's UUID.nameUUIDFromBytes.
 */
export function offlineUuid(name: string): string {
  const hash = createHash("md5").update(`OfflinePlayer:${name}`).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x30;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  return dashUuid(hash.toString("hex"));
}

/** Resolve a typed name to the entry the server would write for it. */
export async function resolvePlayer(
  name: string,
  onlineMode: boolean
): Promise<PlayerListEntry> {
  if (!onlineMode) return { name, uuid: offlineUuid(name) };
  const profile = await $fetch<MinecraftProfile | undefined>(
    `https://api.mojang.com/users/profiles/minecraft/${name}`
  ).catch(() => undefined);
  if (!profile?.id) {
    throw createError({ statusCode: 404, statusMessage: "Player not found" });
  }
  return { name: profile.name, uuid: dashUuid(profile.id) };
}

export async function readPlayerList(
  id: string,
  kind: PlayerListKind
): Promise<PlayerListEntry[]> {
  const data = await readDataFile(id, FILES[kind], MAX_LIST_BYTES);
  const list = parsePlayerList(data?.toString("utf8") ?? null);
  return Promise.all(
    list.map(async (entry) =>
      entry.name
        ? entry
        : { ...entry, name: await cachedProfileName(entry.uuid) }
    )
  );
}

/**
 * Change a list file directly. Only safe while the server is stopped — a
 * running server keeps the lists in memory and overwrites the file on its
 * next change.
 */
export async function editPlayerListFile(
  id: string,
  kind: PlayerListKind,
  op: "add" | "remove",
  player: PlayerListEntry
): Promise<void> {
  const raw = await readDataFile(id, FILES[kind], MAX_LIST_BYTES);
  const list = parsePlayerList(raw?.toString("utf8") ?? null);
  const entry: PlayerListEntry | OpEntry =
    kind === "ops"
      ? { ...player, level: 4, bypassesPlayerLimit: false }
      : player;
  const next = updatePlayerList(list, op, entry);
  await putEntries(id, [
    { path: FILES[kind], data: Buffer.from(JSON.stringify(next, null, 2)) },
  ]);
}

export type WhitelistSettings = { enabled: boolean; enforce: boolean };

const PROPERTY_KEYS: Record<keyof WhitelistSettings, string> = {
  enabled: "white-list",
  enforce: "enforce-whitelist",
};

/** Read the whitelist switches from a server.properties text. */
export function parseWhitelistSettings(raw: string | null): WhitelistSettings {
  const read = (key: string) =>
    new RegExp(`^${key}\\s*=\\s*true\\s*$`, "m").test(raw ?? "");
  return {
    enabled: read(PROPERTY_KEYS.enabled),
    enforce: read(PROPERTY_KEYS.enforce),
  };
}

/** Set one property, appending it when the file doesn't have it yet. */
export function setProperty(raw: string, key: string, value: string): string {
  const line = new RegExp(`^${key}\\s*=.*$`, "m");
  if (line.test(raw)) return raw.replace(line, `${key}=${value}`);
  const separator = raw && !raw.endsWith("\n") ? "\n" : "";
  return `${raw}${separator}${key}=${value}\n`;
}

/**
 * The switches live in server.properties, which itzg leaves alone as long as
 * MCSM doesn't pass ENABLE_WHITELIST / WHITELIST (only done for a new world).
 */
export async function readWhitelistSettings(
  id: string
): Promise<WhitelistSettings> {
  const data = await readDataFile(id, "server.properties", MAX_LIST_BYTES);
  return parseWhitelistSettings(data?.toString("utf8") ?? null);
}

/**
 * Edit server.properties directly. Only while stopped: a running server
 * rewrites the whole file from memory (e.g. on `whitelist on`), which would
 * silently undo the edit.
 */
export async function writeWhitelistSetting(
  id: string,
  setting: keyof WhitelistSettings,
  value: boolean
): Promise<void> {
  const data = await readDataFile(id, "server.properties", MAX_LIST_BYTES);
  const next = setProperty(
    data?.toString("utf8") ?? "",
    PROPERTY_KEYS[setting],
    String(value)
  );
  await putEntries(id, [
    { path: "server.properties", data: Buffer.from(next) },
  ]);
}
