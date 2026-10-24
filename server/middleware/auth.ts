import type { H3Event } from "h3";
import type { UserRow } from "../utils/auth";

/**
 * Global auth gate for the server.
 *
 * Everything under /api and /map requires a login session, except:
 *  - the auth endpoints themselves (login, setup, providers, OAuth, passkey
 *    login and the nuxt-auth-utils session route)
 *  - /api/icons — the itzg image downloads server icons from here when a
 *    Minecraft container starts (no session, comes from the Docker network)
 *  - /api/resource-packs — Minecraft game clients download packs from here
 *  - /map/<volume> — when that volume's map has been published (toggle on the
 *    Map panel); otherwise it stays login-only
 *  - /api/v1 — the public API, which takes a bearer token (personal access
 *    token or OAuth) instead of a session; each handler checks scope, server
 *    restriction and role (see bearerAuth.ts)
 *
 * Logged-in users are then authorized: admin-only areas need the admin flag,
 * per-server routes and maps need a grant on that server (see serverAccess.ts).
 *
 * The SPA itself (HTML/JS assets) stays public — it contains no data and
 * redirects to /login client-side; all data flows through /api.
 */

const PUBLIC_PREFIXES = [
  // Auth flows (password/passkey login, first-run setup, OAuth callbacks).
  "/api/auth/",
  "/api/_auth/",
  "/api/webauthn/authenticate",
  "/auth/",
  // Fetched by Minecraft containers / game clients, not browsers.
  "/api/icons/",
  "/api/resource-packs/",
];

export default defineEventHandler(async (event) => {
  const path = event.path;

  const isApi = path.startsWith("/api/");
  const isMap = path.startsWith("/map/");
  if (!isApi && !isMap) return;

  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

  // Token-only: no session cookies, so it can't be driven cross-site from a
  // logged-in browser.
  if (path.startsWith(PUBLIC_API_PREFIX)) return authenticateApiRequest(event);

  // Published maps are world-readable; everything else needs a session.
  if (isMap) {
    const volume = path.split("/")[2] ?? "";
    const { publicMaps } = await useSettings().get();
    if (publicMaps?.includes(volume)) return;
  }

  const user = await currentUser(event);
  if (user) return authorize(event, user, path, isMap);

  // Browsers navigating to a protected page (e.g. an unpublished map link)
  // get sent to the login screen instead of a raw 401.
  if (isMap && getHeader(event, "accept")?.includes("text/html")) {
    return sendRedirect(event, "/login");
  }

  throw createError({
    statusCode: 401,
    statusMessage: "Authentication required",
  });
});

const PUBLIC_API_PREFIX = "/api/v1/";

// Valid tokens are unguessable, so this only stops a misconfigured client
// from hammering the database with a revoked token.
const failedTokenAttempts = createRateLimiter({ limit: 30, windowMs: 60_000 });
// Generous for a bot; mainly bounds how many RCON connections and Docker
// archive reads one leaked or looping token can trigger.
const TOKEN_RATE_LIMIT = 120;
const tokenRequests = createRateLimiter({
  limit: TOKEN_RATE_LIMIT,
  windowMs: 60_000,
});

async function authenticateApiRequest(event: H3Event) {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? "unknown";
  if (failedTokenAttempts.isBlocked(ip)) throw tooManyRequests(event, 60);

  const auth = await authenticateBearer(event);
  if (!auth) {
    failedTokenAttempts.hit(ip);
    setHeader(event, "WWW-Authenticate", 'Bearer realm="mcsm"');
    throw createError({
      statusCode: 401,
      statusMessage: "Invalid, expired or missing token",
    });
  }

  // OAuth access tokens rotate, so their user is the stable key.
  const key = auth.tokenId ? `pat:${auth.tokenId}` : `oauth:${auth.user.id}`;
  const { allowed, remaining, resetAt } = tokenRequests.hit(key);
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  setHeader(event, "RateLimit-Limit", String(TOKEN_RATE_LIMIT));
  setHeader(event, "RateLimit-Remaining", String(remaining));
  setHeader(event, "RateLimit-Reset", String(retryAfter));
  if (!allowed) throw tooManyRequests(event, retryAfter);

  event.context.bearerAuth = auth;
}

function tooManyRequests(event: H3Event, retryAfterSeconds: number) {
  setHeader(event, "Retry-After", String(retryAfterSeconds));
  return createError({ statusCode: 429, statusMessage: "Too many requests" });
}

const ADMIN_PREFIXES = ["/api/admin/", "/api/users"];

async function authorize(
  event: H3Event,
  user: UserRow,
  path: string,
  isMap: boolean
) {
  if (user.admin) return;

  const pathname = path.split("?")[0] ?? "";
  const method = event.method;
  const forbidden = () =>
    createError({ statusCode: 403, statusMessage: "Admin only" });

  if (ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    throw forbidden();
  }
  // Listing domains is needed by the server settings form; changing them isn't.
  if (pathname.startsWith("/api/domains") && method !== "GET") {
    throw forbidden();
  }
  if (pathname === "/api/server/create") throw forbidden();

  if (isMap) {
    const volume = pathname.split("/")[2] ?? "";
    await assertServerAccess(user, volume, "viewer");
    return;
  }

  const match = pathname.match(/^\/api\/server\/([^/]+)\/?(.*)$/);
  if (!match) return;
  const [, id, subpath] = match;

  let volume: string | null = null;
  try {
    volume = (await useDocker(event).getServer(decodeURIComponent(id!))).volume;
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
  event.context.serverAccess = await assertServerAccess(
    user,
    volume,
    requiredServerRole(method, subpath ?? "")
  );
}
