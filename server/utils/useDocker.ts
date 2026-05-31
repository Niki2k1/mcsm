import Docker from "dockerode";

/**
 * Direct Docker provisioner.
 *
 * MCSM creates the Minecraft container itself (instead of going through
 * Coolify) and tags it with Infrarust labels. Infrarust's docker provider
 * watches the same daemon, discovers the container by its labels and routes
 * `infrarust.domains` to it over the shared network — so there is no proxy
 * config file to write.
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

function connect(host: DockerHostConfig): Docker {
  // Prefer a TCP/TLS connection when a host is configured, otherwise fall back
  // to the local (or socket-proxied) unix socket.
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

export type ProvisionOptions = {
  /** Container name, e.g. `mc-my-server`. Must be unique on the host. */
  name: string;
  image: string;
  env: Record<string, string>;
  labels: Record<string, string>;
  /** Hard memory limit in bytes (cgroup). */
  memoryBytes?: number;
  /** Minecraft port inside the container. */
  port?: number;
  /** Shared Docker network Infrarust is attached to. */
  network?: string;
  /** Named volume mounted at /data for world persistence. */
  volume?: string;
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

    const container = await docker.createContainer({
      name: options.name,
      Image: options.image,
      Env: Object.entries(options.env).map(([key, value]) => `${key}=${value}`),
      Labels: options.labels,
      ExposedPorts: { [`${port}/tcp`]: {} },
      HostConfig: {
        Memory: options.memoryBytes,
        RestartPolicy: { Name: "unless-stopped" },
        Binds: options.volume ? [`${options.volume}:/data`] : undefined,
        // Attach to the shared network so Infrarust can resolve the container
        // by name and reach it on the internal port.
        NetworkMode: network,
      },
    });

    await container.start();

    return { id: container.id, name: options.name };
  }

  return { docker, ensureImage, provisionServer };
};
