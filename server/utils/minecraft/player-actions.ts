import type { H3Event } from "h3";

/**
 * Player management shared by every entry point (dashboard, MCP tools and the
 * public API), so they all follow the same rules: RCON while the server runs,
 * a direct file edit while it's stopped, and no changes while it is still
 * starting.
 */

export const PLAYER_ACTIONS = [
  "op",
  "deop",
  "whitelist-add",
  "whitelist-remove",
  "kick",
] as const;

export type PlayerAction = (typeof PLAYER_ACTIONS)[number];

/**
 * Strict Minecraft username pattern. Names end up inside RCON commands, so
 * this is also what keeps a request from smuggling in a second command.
 */
export const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/;

async function findServer(event: H3Event | undefined, id: string) {
  try {
    return await useDocker(event).getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
}

export type PlayerOverview = {
  running: boolean;
  /** True when the live player list could not be read (stopped or booting). */
  offline: boolean;
  online: { name: string }[];
  ops: PlayerListEntry[];
  whitelist: PlayerListEntry[];
  settings: WhitelistSettings;
};

/**
 * Who is online (live, via RCON `list`) plus the server's own whitelist.json
 * and ops.json and its whitelist switches, which are current whether the
 * server runs or not.
 */
export async function getPlayerOverview(
  event: H3Event | undefined,
  id: string
): Promise<PlayerOverview> {
  const server = await findServer(event, id);
  const [whitelist, ops, settings] = await Promise.all([
    readPlayerList(id, "whitelist"),
    readPlayerList(id, "ops"),
    readWhitelistSettings(id),
  ]);
  const lists = { ops, whitelist, settings };

  if (!server.running) {
    return { running: false, offline: true, online: [], ...lists };
  }

  try {
    const online = await withRcon(event, id, async (rcon) =>
      parsePlayerNames(await rcon.send("list"))
    );
    return {
      running: true,
      offline: false,
      online: online.map((name) => ({ name })),
      ...lists,
    };
  } catch {
    // RCON not ready yet (server still booting) — the lists are still valid.
    return { running: true, offline: true, online: [], ...lists };
  }
}

export type PlayerActionResult = {
  /** How the change was applied; "file" takes effect on the next start. */
  via: "rcon" | "file";
  /** The server's RCON reply; empty for file edits. */
  response: string;
};

/** Who an action targets. Removals may use the UUID alone (see below). */
export type PlayerTarget = { name?: string; uuid?: string };

/** Accepted UUID spellings, dashed or not. */
export const PLAYER_UUID_PATTERN = /^[0-9a-fA-F-]{32,36}$/;

/**
 * Apply a player action without recreating the container. A running server
 * gets the command over RCON and rewrites its ops.json / whitelist.json
 * itself; a stopped one has the file edited directly, so it applies on the
 * next start.
 *
 * Removals also accept a bare UUID, for entries without a name (offline-mode
 * players Mojang can't resolve, or lists seeded from bare UUIDs).
 */
export async function runPlayerAction(
  event: H3Event | undefined,
  id: string,
  action: PlayerAction,
  target: PlayerTarget
): Promise<PlayerActionResult> {
  const { name, uuid } = target;
  // Re-checked here so no caller can forget it before building a command.
  if (name !== undefined && !PLAYER_NAME_PATTERN.test(name)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid player name",
    });
  }
  if (uuid !== undefined && !PLAYER_UUID_PATTERN.test(uuid)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid player UUID",
    });
  }
  const removal = action === "deop" || action === "whitelist-remove";
  if (!name && !(removal && uuid)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Player name required",
    });
  }

  const server = await findServer(event, id);

  if (!server.running && action !== "kick") {
    const kind = action.startsWith("whitelist") ? "whitelist" : "ops";
    const op = action === "op" || action === "whitelist-add" ? "add" : "remove";
    // Removal matches by name or UUID, so it needs no lookup (and works for
    // players whose Mojang account no longer resolves).
    const player =
      op === "add"
        ? await resolvePlayer(name!, server.config?.ONLINE_MODE ?? true)
        : { name: name ?? "", uuid: uuid ?? "" };
    await editPlayerListFile(id, kind, op, player);
    return { via: "file", response: "" };
  }

  if (!name) {
    // RCON commands need a name. The whitelist can be reloaded from its file,
    // ops can't — those have to wait for a stopped server.
    if (action !== "whitelist-remove") {
      throw createError({
        statusCode: 409,
        statusMessage: "Stop the server to remove this operator",
      });
    }
    await editPlayerListFile(id, "whitelist", "remove", {
      name: "",
      uuid: uuid!,
    });
    const response = await withRcon(event, id, (rcon) =>
      rcon.send("whitelist reload")
    );
    return { via: "rcon", response };
  }

  const commands: Record<PlayerAction, string> = {
    op: `op ${name}`,
    deop: `deop ${name}`,
    "whitelist-add": `whitelist add ${name}`,
    "whitelist-remove": `whitelist remove ${name}`,
    kick: `kick ${name}`,
  };

  // A running server whose RCON doesn't answer yet is still booting: this
  // fails (502) instead of editing the file, which the server would
  // overwrite once it has loaded the lists.
  const response = await withRcon(event, id, (rcon) =>
    rcon.send(commands[action])
  );
  return { via: "rcon", response };
}

export type WhitelistChange = {
  result: "added" | "already-whitelisted" | "removed" | "not-whitelisted";
  /** The matching entry from whitelist.json after the change, if any. */
  player: PlayerListEntry | null;
} & PlayerActionResult;

const findByName = (list: PlayerListEntry[], name: string) =>
  list.find((entry) => entry.name.toLowerCase() === name.toLowerCase()) ?? null;

/**
 * Add or remove a whitelisted player and report what actually changed.
 * The outcome is read back from whitelist.json instead of parsing the RCON
 * reply, whose wording differs between versions, mods and languages; a
 * running server saves the file before it answers the command.
 */
export async function changeWhitelist(
  event: H3Event | undefined,
  id: string,
  op: "add" | "remove",
  name: string
): Promise<WhitelistChange> {
  const before = findByName(await readPlayerList(id, "whitelist"), name);
  const outcome = await runPlayerAction(
    event,
    id,
    op === "add" ? "whitelist-add" : "whitelist-remove",
    { name }
  );
  const after = findByName(await readPlayerList(id, "whitelist"), name);

  if (op === "add") {
    if (!after) {
      // Minecraft refused it — in practice an unknown account.
      throw createError({
        statusCode: 404,
        statusMessage: outcome.response || "Player not found",
        data: { reason: "player-not-found" },
      });
    }
    return {
      ...outcome,
      result: before ? "already-whitelisted" : "added",
      player: after,
    };
  }
  if (after) {
    throw createError({
      statusCode: 502,
      statusMessage: outcome.response || "Player could not be removed",
    });
  }
  return {
    ...outcome,
    result: before ? "removed" : "not-whitelisted",
    player: null,
  };
}
