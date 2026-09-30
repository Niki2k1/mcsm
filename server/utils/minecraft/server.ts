import { pingJava } from "@minescope/mineping";

export interface ServerStatusOptions {
  host: string;
  port?: number;
  timeout?: number;
  protocolVersion?: number;
}

/**
 * Server List Ping a Java server. Resolves to `{ status, latency }`: `status`
 * is the server's raw status JSON (version, players, description, favicon)
 * and `latency` the wall-clock round trip in ms. mineping skips the SRV
 * lookup on its own for IPs and localhost (e.g. dev tunnels).
 */
export const useMinecraftServer = async (options: ServerStatusOptions) => {
  const started = performance.now();
  const status = await pingJava(options.host, {
    port: options.port,
    timeout: options.timeout,
    protocolVersion: options.protocolVersion,
  });
  return { status, latency: Math.round(performance.now() - started) };
};
