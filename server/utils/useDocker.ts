import Docker from "dockerode";
import type { H3Event } from "h3";
import type { ServerConfig } from "../schema/server.schema";

/**
 * The uid/gid the itzg image runs the Minecraft process as. Anything we push
 * into /data via `putArchive` must be owned by this user: tar headers default
 * to uid/gid 0, and Docker applies that ownership to every entry — including
 * directory entries, which re-own *existing* dirs (e.g. the world folder) to
 * root. The server runs as UID 1000 by default and then can't write them,
 * which shows up as "Failed to save level: Permission denied". Honors a custom
 * UID/GID set on the container; falls back to itzg's 1000:1000 default.
 */
export async function containerOwner(
  container: Docker.Container
): Promise<{ uid: number; gid: number }> {
  const fallback = { uid: 1000, gid: 1000 };
  try {
    const info = await container.inspect();
    const env = info.Config?.Env ?? [];
    const read = (key: string) => {
      const entry = env.find((e) => e.startsWith(`${key}=`));
      if (!entry) return null;
      const value = Number(entry.slice(key.length + 1));
      return Number.isInteger(value) && value >= 0 ? value : null;
    };
    return {
      uid: read("UID") ?? fallback.uid,
      gid: read("GID") ?? fallback.gid,
    };
  } catch {
    return fallback;
  }
}

/**
 * Direct Docker provisioner.
 *
 * MCSM creates the Minecraft container itself (instead of going through
 * Coolify) and tags it with Infrarust labels plus an `mcsm.config` JSON label
 * that holds the full wizard config. Docker is the source of truth: the list,
 * edit and delete flows all read straight from the daemon — there is no
 * database and no proxy config file.
 *
 * Hosts are looked up by id from `runtimeConfig.docker.hosts`, which keeps the
 * door open for managing multiple Docker daemons later. Only `default` is
 * wired up for now.
 */

type DockerHostConfig = {
  socketPath?: string;
  host?: string;
  port?: string | number;
  protocol?: string;
  ca?: string;
  cert?: string;
  key?: string;
};

export type ServerSummary = {
  id: string;
  name: string;
  domain: string;
  type: string | null;
  running: boolean;
  config: ServerConfig | null;
  /** World volume name — stable identity (e.g. for /map/<volume>/ links). */
  volume: string | null;
};

function connect(host: DockerHostConfig): Docker {
  if (host.host) {
    return new Docker({
      host: host.host,
      port: host.port ? Number(host.port) : undefined,
      protocol: (host.protocol as "https" | "http") || undefined,
      ca: host.ca || undefined,
      cert: host.cert || undefined,
      key: host.key || undefined,
    });
  }

  return new Docker({ socketPath: host.socketPath || "/var/run/docker.sock" });
}

function parseConfig(labels: Record<string, string> = {}): ServerConfig | null {
  try {
    return labels["mcsm.config"]
      ? (JSON.parse(labels["mcsm.config"]) as ServerConfig)
      : null;
  } catch {
    return null;
  }
}

export type ProvisionOptions = {
  /** Container name, e.g. `mc-my-server`. Must be unique on the host. */
  name: string;
  image: string;
  env: Record<string, string>;
  labels: Record<string, string>;
  memoryBytes?: number;
  port?: number;
  network?: string;
  /** Named volume mounted at /data for world persistence. */
  volume?: string;
  /** Docker restart policy ("unless-stopped" unless auto-stop is enabled). */
  restartPolicy?: string;
};

// `event` is threaded through to `useRuntimeConfig(event)` so the Docker
// connection settings (host/port/protocol/socket) pick up their `NUXT_`-prefixed
// runtime env overrides per request. Without the event, server routes read the
// build-time-baked config and ignore the deployment's env — see the runtime
// config docs: https://nuxt.com/docs/guide/going-further/runtime-config
export const useDocker = (event?: H3Event, hostId = "default") => {
  const config = useRuntimeConfig(event);
  const hosts = (config.docker?.hosts ?? {}) as Record<string, DockerHostConfig>;
  const host = hosts[hostId];

  if (!host) {
    throw createError({
      statusCode: 500,
      statusMessage: `Unknown Docker host '${hostId}'`,
    });
  }

  const docker = connect(host);

  /** Pull the image if it is not already present on the host. */
  async function ensureImage(image: string) {
    const existing = await docker.listImages({
      filters: { reference: [image] },
    });
    if (existing.length > 0) return;

    const stream = await docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (err) =>
        err ? reject(err) : resolve()
      );
    });
  }

  /** Create and start a Minecraft server container. */
  async function provisionServer(options: ProvisionOptions) {
    await ensureImage(options.image);

    const port = options.port ?? 25565;
    const network = options.network || config.docker?.network || undefined;

    const container = await docker.createContainer({
      name: options.name,
      Image: options.image,
      Env: Object.entries(options.env).map(([key, value]) => `${key}=${value}`),
      Labels: options.labels,
      ExposedPorts: { [`${port}/tcp`]: {} },
      HostConfig: {
        Memory: options.memoryBytes,
        RestartPolicy: { Name: options.restartPolicy ?? "unless-stopped" },
        Binds: options.volume ? [`${options.volume}:/data`] : undefined,
        NetworkMode: network,
      },
    });

    await container.start();

    return { id: container.id, name: options.name };
  }

  /** All MCSM-managed servers on this host. */
  async function listServers(): Promise<ServerSummary[]> {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ["mcsm.managed=true"] },
    });

    return containers.map((container) => {
      const labels = container.Labels ?? {};
      const cfg = parseConfig(labels);
      return {
        id: container.Id,
        name: labels["mcsm.name"] ?? cfg?.name ?? "",
        domain: (labels["infrarust.domains"] ?? "").split(",")[0] ?? "",
        type: cfg?.type ?? null,
        running: container.State === "running",
        config: cfg,
        volume:
          (container.Mounts ?? []).find(
            (mount) => mount.Destination === "/data"
          )?.Name ?? null,
      };
    });
  }

  /** A single server, including the volume backing it. */
  async function getServer(id: string) {
    const info = await docker.getContainer(id).inspect();
    const labels = info.Config?.Labels ?? {};
    const cfg = parseConfig(labels);
    const volume = (info.Mounts ?? []).find(
      (mount) => mount.Destination === "/data"
    )?.Name;

    return {
      id: info.Id,
      name: labels["mcsm.name"] ?? cfg?.name ?? "",
      domain: (labels["infrarust.domains"] ?? "").split(",")[0] ?? "",
      running: info.State?.Running ?? false,
      config: cfg,
      containerName: (info.Name ?? "").replace(/^\//, ""),
      volume,
      // When the container started (ISO string) — used for uptime display.
      startedAt: info.State?.Running ? (info.State?.StartedAt ?? null) : null,
      createdAt: info.Created ?? null,
    };
  }

  /**
   * Stop and remove a server. The named volume (the world) is preserved unless
   * `removeVolume` is set.
   */
  async function removeServer(id: string, opts?: { removeVolume?: boolean }) {
    const container = docker.getContainer(id);
    const info = await container.inspect();

    try {
      await container.stop({ t: 10 });
    } catch {
      // Already stopped — ignore.
    }
    await container.remove({ force: true });

    if (opts?.removeVolume) {
      const volume = (info.Mounts ?? []).find(
        (mount) => mount.Destination === "/data"
      )?.Name;
      if (volume) {
        try {
          await docker.getVolume(volume).remove();
        } catch {
          // Volume in use or already gone — ignore.
        }
      }
    }
  }

  /** Start a stopped container (no-op if already running). */
  async function startServer(id: string) {
    try {
      await docker.getContainer(id).start();
    } catch (error) {
      // 304 = already started.
      if ((error as { statusCode?: number }).statusCode !== 304) throw error;
    }
  }

  /** Stop a running container (no-op if already stopped). */
  async function stopServer(id: string) {
    try {
      await docker.getContainer(id).stop({ t: 10 });
    } catch (error) {
      // 304 = already stopped.
      if ((error as { statusCode?: number }).statusCode !== 304) throw error;
    }
  }

  /** Restart a container (starts it if it was stopped). */
  async function restartServer(id: string) {
    await docker.getContainer(id).restart({ t: 10 });
  }

  return {
    docker,
    ensureImage,
    provisionServer,
    listServers,
    getServer,
    removeServer,
    startServer,
    stopServer,
    restartServer,
  };
};
