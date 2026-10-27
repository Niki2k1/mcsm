/**
 * Simple Voice Chat (https://modrinth.com/plugin/simple-voice-chat).
 *
 * Voice traffic is UDP, which Infrarust can't forward, so every server with
 * voice chat publishes its own UDP port directly on the Docker host. The
 * container port equals the host port, so the plugin/mod never needs a
 * `voice_host` override: clients reach it at the address they joined with.
 *
 * Shared between app and server so the wizard offers the toggle for exactly
 * the types the server side installs it on.
 */

/** Modrinth slug installed via MODRINTH_PROJECTS. */
export const VOICE_CHAT_SLUG = "simple-voice-chat";

/** Simple Voice Chat's own default; auto-assignment counts up from here. */
export const VOICE_CHAT_DEFAULT_PORT = 24454;

/**
 * Same plugin/mod-capable set as BlueMap. VANILLA has no loader and FTBA's
 * installer manages its own files.
 */
export const VOICE_CHAT_SUPPORTED_TYPES = [
  "PAPER",
  "FABRIC",
  "FORGE",
  "NEOFORGE",
  "AUTO_CURSEFORGE",
] as const;

export function serverTypeSupportsVoiceChat(type: string | null | undefined) {
  return (VOICE_CHAT_SUPPORTED_TYPES as readonly string[]).includes(type ?? "");
}

/**
 * Where the server-side properties live inside the world volume — plugins/
 * for Bukkit-based servers, config/ for mod loaders.
 */
export function voiceChatConfigPath(type: string | null | undefined): string {
  return type === "PAPER"
    ? "plugins/voicechat/voicechat-server.properties"
    : "config/voicechat/voicechat-server.properties";
}

type VoiceChatConfig = {
  type: string | null;
  VOICE_CHAT?: boolean | null;
  voicePort?: number | null;
};

/** Whether a stored config actually publishes a voice port. */
export function activeVoicePort(config: VoiceChatConfig | null | undefined) {
  if (!config?.VOICE_CHAT || !serverTypeSupportsVoiceChat(config.type))
    return null;
  return config.voicePort ?? null;
}

export class VoicePortConflictError extends Error {
  constructor(readonly port: number) {
    super(`UDP port ${port} is already used by another server's voice chat`);
  }
}

/**
 * Pick the voice port for a server.
 *
 * An explicitly requested port must be free. Without one, the server keeps
 * the port it had before (a changed port would no longer match what players'
 * clients and firewall rules expect) unless another server took it meanwhile,
 * and otherwise gets the first free port from the default upwards.
 */
export function pickVoicePort(options: {
  requested?: number | null;
  previous?: number | null;
  used: Iterable<number>;
}): number {
  const used = new Set(options.used);

  if (options.requested != null) {
    if (used.has(options.requested))
      throw new VoicePortConflictError(options.requested);
    return options.requested;
  }

  if (options.previous != null && !used.has(options.previous))
    return options.previous;

  for (let port = VOICE_CHAT_DEFAULT_PORT; port <= 65535; port++) {
    if (!used.has(port)) return port;
  }
  throw new Error("No free UDP port left for voice chat");
}
