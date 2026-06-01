import { z } from "zod";
import dns from "node:dns/promises";
import net from "node:net";

/**
 * Preflight a domain: does it resolve, is the Minecraft port reachable, and (for
 * a real server domain) does a Minecraft server actually answer?
 *
 * Scoped to domains MCSM manages so it can't be used to probe arbitrary hosts,
 * and limited to the single public Minecraft port — this is a self-diagnostic,
 * not a port scanner. Everything runs from the MCSM container, so results
 * reflect that vantage point (see the NAT-hairpin note in the UI).
 */

const MC_PORT = 25565;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function resolveHost(host: string) {
  const addresses: string[] = [];
  try {
    addresses.push(...(await dns.resolve4(host)));
  } catch {
    // no A record
  }
  try {
    addresses.push(...(await dns.resolve6(host)));
  } catch {
    // no AAAA record
  }
  // Fall back to the OS resolver (handles CNAME-only chains) if nothing yet.
  if (!addresses.length) {
    try {
      const looked = await dns.lookup(host, { all: true });
      addresses.push(...looked.map((entry) => entry.address));
    } catch {
      // unresolved
    }
  }
  return addresses.length
    ? { ok: true, addresses }
    : { ok: false, addresses, error: "No A/AAAA record" };
}

async function resolveExpected(value: string): Promise<string[]> {
  if (net.isIP(value)) return [value];
  return (await resolveHost(value)).addresses;
}

function tcpCheck(host: string, port: number, timeoutMs = 3000) {
  return new Promise<{ ok: boolean; ms?: number; error?: string }>((resolve) => {
    const socket = new net.Socket();
    const start = Date.now();
    let settled = false;
    const done = (result: { ok: boolean; ms?: number; error?: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done({ ok: true, ms: Date.now() - start }));
    socket.once("timeout", () => done({ ok: false, error: "Timed out" }));
    socket.once("error", (err) => done({ ok: false, error: err.message }));
    socket.connect(port, host);
  });
}

export default defineEventHandler(async (event) => {
  const { host, mode } = await useValidatedQuery(event, {
    host: z.string().min(1),
    mode: z.enum(["wildcard", "server"]).optional(),
  });

  // Only allow checking domains MCSM manages (the base, or a subdomain of one).
  const domains = await useDomains().list();
  const owned = domains.some((d) => host === d || host.endsWith(`.${d}`));
  if (!owned) {
    throw createError({
      statusCode: 403,
      statusMessage: "Domain is not managed by MCSM",
    });
  }

  const isWildcard = mode === "wildcard";
  // For a base domain, probe a random label so we actually test the wildcard.
  const target = isWildcard
    ? `mcsm-probe-${Math.random().toString(36).slice(2, 8)}.${host}`
    : host;

  const dnsResult = await withTimeout(resolveHost(target), 4000, {
    ok: false,
    addresses: [] as string[],
    error: "DNS timed out",
  });

  // Optionally confirm DNS points at the configured public address.
  let expected:
    | { host: string; addresses: string[]; matches: boolean }
    | undefined;
  const { publicHost } = await useSettings().get();
  if (publicHost) {
    const expectedIps = await withTimeout(resolveExpected(publicHost), 4000, []);
    expected = {
      host: publicHost,
      addresses: expectedIps,
      matches:
        dnsResult.ok &&
        expectedIps.length > 0 &&
        dnsResult.addresses.some((ip) => expectedIps.includes(ip)),
    };
  }

  const tcp = dnsResult.ok
    ? await tcpCheck(dnsResult.addresses[0]!, MC_PORT)
    : { ok: false, error: "Skipped — DNS did not resolve" };

  // Only a real server domain has a backend to answer a Minecraft ping.
  let mc:
    | {
        ok: boolean;
        version?: string;
        players?: { online: number; max: number };
        error?: string;
      }
    | null = null;
  if (!isWildcard && tcp.ok) {
    try {
      const result = await useMinecraftServer({ host: target, timeout: 4000 });
      const status = (result as { status?: any })?.status;
      mc = {
        ok: true,
        version: status?.version?.name,
        players: status?.players
          ? { online: status.players.online, max: status.players.max }
          : undefined,
      };
    } catch (error) {
      mc = { ok: false, error: (error as Error).message };
    }
  }

  return {
    target,
    mode: isWildcard ? "wildcard" : "server",
    port: MC_PORT,
    dns: dnsResult,
    expected,
    tcp,
    mc,
  };
});
