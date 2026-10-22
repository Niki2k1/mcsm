/** Result of the admin DNS / TCP / Minecraft reachability check. */
export interface DomainCheck {
  target: string;
  mode: "wildcard" | "server";
  port: number;
  dns: { ok: boolean; addresses: string[]; error?: string };
  expected?: { host: string; addresses: string[]; matches: boolean };
  tcp: { ok: boolean; ms?: number; error?: string };
  mc: {
    ok: boolean;
    version?: string;
    players?: { online: number; max: number };
    error?: string;
  } | null;
}
