import { Rcon } from "rcon-client";
import { PassThrough } from "node:stream";
import type Dockerode from "dockerode";
import type { H3Event } from "h3";

/**
 * The slice of the RCON client that callbacks actually use. Satisfied by both
 * the real TCP client (production) and the dev-mode `docker exec` shim.
 */
export interface RconConnection {
  send(command: string): Promise<string>;
}

/**
 * Run RCON commands against a server's container.
 *
 * In production, MCSM reaches the container by name on the shared Docker
 * network; the RCON port is never published.
 *
 * In local dev the app runs on the host, where container names don't resolve
 * (and container IPs aren't routable from macOS), so commands run through
 * `docker exec rcon-cli` inside the container instead. That's possible because
 * dev talks to the Docker socket directly — production goes through a
 * restricted socket proxy that has no exec permission.
 *
 * Throws 404 (unknown server), 409 (not running) or 502 (RCON failure) —
 * matching what API routes are expected to surface.
 *
 * `event` is optional so background plugins (no request context) can use this
 * too — `useRuntimeConfig`/`useDocker` both work without an event.
 */
export async function withRcon<T>(
  event: H3Event | undefined,
  serverId: string,
  fn: (rcon: RconConnection) => Promise<T>
): Promise<T> {
  const config = useRuntimeConfig(event);
  const { docker, getServer } = useDocker(event);

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(serverId);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!server.running) {
    throw createError({
      statusCode: 409,
      statusMessage: "Server is not running",
    });
  }
  if (!server.containerName) {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  let rcon: Rcon | undefined;
  try {
    let connection: RconConnection;
    if (import.meta.dev) {
      // Local dev: exec rcon-cli inside the container (it reads RCON_PASSWORD
      // and RCON_PORT from the container's own environment).
      const container = docker.getContainer(server.id);
      connection = { send: (command) => execRconCli(container, command) };
    } else {
      rcon = await Rcon.connect({
        host: server.containerName,
        port: Number(config.rcon?.port ?? 25575),
        password: config.rcon?.password ?? "minecraft",
      });
      connection = rcon;
    }
    return await fn(connection);
  } catch (error) {
    // Don't re-wrap errors the callback intentionally threw.
    if (error && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({
      statusCode: 502,
      statusMessage: "RCON command failed",
    });
  } finally {
    await rcon?.end().catch(() => {});
  }
}

/**
 * Run a single RCON command via the `rcon-cli` binary bundled in the itzg
 * image. Dev-mode only — see `withRcon`.
 */
async function execRconCli(
  container: Dockerode.Container,
  command: string
): Promise<string> {
  const exec = await container.exec({
    Cmd: ["rcon-cli", command],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({});

  // Exec output is multiplexed (stdout/stderr frames) — demux and collect.
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const outChunks: Buffer[] = [];
  const errChunks: Buffer[] = [];
  stdout.on("data", (chunk: Buffer) => outChunks.push(chunk));
  stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));
  container.modem.demuxStream(stream, stdout, stderr);

  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("close", resolve);
    stream.on("error", reject);
  });

  const { ExitCode } = await exec.inspect();
  const out = stripAnsi(Buffer.concat(outChunks).toString("utf8")).trim();
  const err = stripAnsi(Buffer.concat(errChunks).toString("utf8")).trim();

  if (ExitCode !== 0) {
    throw new Error(err || out || `rcon-cli exited with code ${ExitCode}`);
  }
  return out;
}

/**
 * rcon-cli renders Minecraft formatting codes as ANSI terminal colors; the TCP
 * client returns plain text. Strip the escapes so both paths look identical to
 * response parsers (chunky progress, player lists).
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*m/g, "");
}

/**
 * Parse Minecraft's "There are N ... players online: Alice, Bob" responses
 * into a list of names. Works for `list` and `whitelist list`.
 */
export function parsePlayerNames(response: string): string[] {
  const colon = response.indexOf(":");
  if (colon === -1) return [];
  return response
    .slice(colon + 1)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}
