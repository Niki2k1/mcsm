import { pingJava } from "@minescope/mineping";

export interface ServerStatusOptions {
  host: string;
  port?: number;
  timeout?: number;
  protocolVersion?: number;
}

// Infrarust answers pings itself when it cannot relay to a backend: for
// domains without a route (a stopped container drops its route) and for
// unreachable or managed-state servers. Those synthetic responses carry this
// version name unless the proxy config overrides it, which MCSM never does.
const INFRARUST_SYNTHETIC_VERSION = "Infrarust";

/**
 * Server List Ping a Java server. Resolves to `{ status, latency }`: `status`
 * is the server's raw status JSON (version, players, description, favicon)
 * and `latency` the wall-clock round trip in ms. mineping skips the SRV
 * lookup on its own for IPs and localhost (e.g. dev tunnels).
 *
 * Rejects when only the proxy answered, so callers treat the server as
 * offline instead of showing "An Infrarust Proxy" as a live server.
 */
export const useMinecraftServer = async (options: ServerStatusOptions) => {
  const started = performance.now();
  const status = await pingJava(options.host, {
    port: options.port,
    timeout: options.timeout,
    protocolVersion: options.protocolVersion,
  });
  if (status.version?.name === INFRARUST_SYNTHETIC_VERSION) {
    throw new Error("Server unreachable (answered by the Infrarust proxy)");
  }
  return { status, latency: Math.round(performance.now() - started) };
};
