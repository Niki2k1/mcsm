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

  // Published maps are world-readable; everything else needs a session.
  if (isMap) {
    const volume = path.split("/")[2] ?? "";
    const { publicMaps } = await useSettings().get();
    if (publicMaps?.includes(volume)) return;
  }

  const session = await getUserSession(event);
  if (session.user) return;

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
