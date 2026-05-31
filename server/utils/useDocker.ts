import Docker from "dockerode";
import type { ServerConfig } from "../schema/server.schema";

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
  /** Container ports to publish on the host (e.g. BlueMap's web UI). */
  publishPorts?: { container: number; host: number }[];
};

export const useDocker = (hostId = "default") => {
  const config = useRuntimeConfig();
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

    // The MC port is reached via Infrarust on the shared network and is never
    // published; only explicitly requested ports (e.g. BlueMap) are bound to
    // the host.
    const exposedPorts: Record<string, Record<string, never>> = {
      [`${port}/tcp`]: {},
    };
    const portBindings: Record<string, { HostPort: string }[]> = {};
    for (const mapping of options.publishPorts ?? []) {
      exposedPorts[`${mapping.container}/tcp`] = {};
      portBindings[`${mapping.container}/tcp`] = [
        { HostPort: String(mapping.host) },
      ];
    }

    const container = await docker.createContainer({
      name: options.name,
      Image: options.image,
      Env: Object.entries(options.env).map(([key, value]) => `${key}=${value}`),
      Labels: options.labels,
      ExposedPorts: exposedPorts,
      HostConfig: {
        Memory: options.memoryBytes,
        RestartPolicy: { Name: "unless-stopped" },
        Binds: options.volume ? [`${options.volume}:/data`] : undefined,
        NetworkMode: network,
        PortBindings:
          Object.keys(portBindings).length > 0 ? portBindings : undefined,
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

  return {
    docker,
    ensureImage,
    provisionServer,
    listServers,
    getServer,
    removeServer,
    startServer,
    stopServer,
  };
};
