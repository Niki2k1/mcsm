import type { H3Event } from "h3";

/**
 * Dev-only TCP tunnels into the Docker network.
 *
 * In production MCSM runs as a container on the shared Docker network and
 * reaches Minecraft containers directly by name. In local dev the app runs on
 * the host, where container names don't resolve and container IPs aren't
 * routable (Docker Desktop), so connections go through disposable socat
 * helper containers that publish an ephemeral 127.0.0.1 port — the same
 * helper-container pattern backups use.
 *
 * Tunnels are created on demand, reused across requests (and dev sessions),
 * and recreated automatically when their target container changes (config
 * edits recreate containers). Manual cleanup, if ever needed:
 *
 *   docker rm -f $(docker ps -aq --filter label=mcsm.dev-tunnel)
 */

const TUNNEL_IMAGE = "alpine/socat:latest";
const TUNNEL_LABEL = "mcsm.dev-tunnel";
const TARGET_LABEL = "mcsm.dev-tunnel.target";

export type ContainerTarget = {
  /** Container name, e.g. `mc-test-prerender`. */
  name: string;
  /** Container id — used to detect when the target was recreated. */
  id: string;
};

/**
 * Resolve the address MCSM should use to reach `target`'s `port`:
 * the container name in production, a 127.0.0.1 dev tunnel in local dev.
 */
export async function containerAddress(
  event: H3Event | undefined,
  target: ContainerTarget,
  port: number
): Promise<{ host: string; port: number }> {
  if (!import.meta.dev) return { host: target.name, port };
  return devTunnelTo(event, target, port);
}

// --- Tunnel machinery ---------------------------------------------------------

/** "<container>:<port>" → resolved host port, refreshed every TTL. */
const cache = new Map<string, { at: number; port: number }>();
const pending = new Map<string, Promise<number>>();
const CACHE_TTL_MS = 10_000;

async function devTunnelTo(
  event: H3Event | undefined,
  target: ContainerTarget,
  targetPort: number
): Promise<{ host: string; port: number }> {
  const key = `${target.id}:${targetPort}`;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { host: "127.0.0.1", port: cached.port };
  }

  // Tile bursts (BlueMap) fire many concurrent requests — only one creates.
  let inflight = pending.get(key);
  if (!inflight) {
    inflight = ensureTunnel(event, target, targetPort).finally(() =>
      pending.delete(key)
    );
    pending.set(key, inflight);
  }

  const port = await inflight;
  cache.set(key, { at: Date.now(), port });
  return { host: "127.0.0.1", port };
}

async function ensureTunnel(
  event: H3Event | undefined,
  target: ContainerTarget,
  targetPort: number
): Promise<number> {
  const { docker, ensureImage } = useDocker(event);
  const config = useRuntimeConfig(event);
  const network = config.docker?.network || "infrarust";
  const name = `mcsm-dev-tunnel-${target.name}-${targetPort}`;

  // Reuse a running tunnel that still points at the same target container.
  try {
    const existing = docker.getContainer(name);
    const info = await existing.inspect();
    const sameTarget = info.Config?.Labels?.[TARGET_LABEL] === target.id;
    if (info.State?.Running && sameTarget) {
      const port = publishedPort(info, targetPort);
      if (port) return port;
    }
    // Stopped, stale, or broken — replace it.
    await existing.remove({ force: true }).catch(() => {});
  } catch {
    // Doesn't exist yet.
  }

  await ensureImage(TUNNEL_IMAGE);

  const container = await docker.createContainer({
    name,
    Image: TUNNEL_IMAGE,
    Cmd: [
      `tcp-listen:${targetPort},fork,reuseaddr`,
      `tcp-connect:${target.name}:${targetPort}`,
    ],
    Labels: { [TUNNEL_LABEL]: "true", [TARGET_LABEL]: target.id },
    ExposedPorts: { [`${targetPort}/tcp`]: {} },
    HostConfig: {
      NetworkMode: network,
      AutoRemove: true,
      // Loopback only — never expose Minecraft/BlueMap ports to the LAN.
      PortBindings: {
        [`${targetPort}/tcp`]: [{ HostIp: "127.0.0.1", HostPort: "" }],
      },
    },
  });
  await container.start();

  const info = await container.inspect();
  const port = publishedPort(info, targetPort);
  if (!port) {
    await container.remove({ force: true }).catch(() => {});
    throw new Error(
      `Dev tunnel to ${target.name}:${targetPort} got no published port`
    );
  }
  return port;
}

function publishedPort(
  info: { NetworkSettings?: { Ports?: Record<string, { HostPort?: string }[] | null> } },
  targetPort: number
): number | null {
  const bindings = info.NetworkSettings?.Ports?.[`${targetPort}/tcp`];
  const hostPort = bindings?.[0]?.HostPort;
  return hostPort ? Number(hostPort) : null;
}

// --- Domain resolution (status pings) ------------------------------------------

/**
 * Map a server's public domain to a tunneled local address (dev only — returns
 * null in production or when no managed running server matches the domain).
 *
 * The dashboard pings servers by their domain, exactly like a game client. In
 * dev those domains have no DNS, so the ping is redirected to a tunnel into
 * the matching container instead.
 */
export async function devAddressForDomain(
  event: H3Event | undefined,
  domain: string,
  port = 25565
): Promise<{ host: string; port: number } | null> {
  if (!import.meta.dev) return null;

  const { listServers, getServer } = useDocker(event);
  const servers = await listServers();
  const match = servers.find((server) => server.domain === domain);
  if (!match?.running) return null;

  const detail = await getServer(match.id);
  if (!detail.containerName) return null;

  try {
    return await containerAddress(
      event,
      { name: detail.containerName, id: detail.id },
      port
    );
  } catch {
    // Tunnel creation failed — let the caller fall back to a direct ping.
    return null;
  }
}
