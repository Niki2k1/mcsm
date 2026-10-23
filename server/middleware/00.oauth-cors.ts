/**
 * Browser-based MCP clients (e.g. the MCP Inspector) call the discovery and
 * token endpoints cross-origin. These endpoints never rely on cookies, so a
 * wildcard origin is safe.
 */
const CORS_PREFIXES = ["/oauth/", "/.well-known/oauth-"];

export default defineEventHandler((event) => {
  const path = event.path.split("?")[0] ?? "";
  if (!CORS_PREFIXES.some((prefix) => path.startsWith(prefix))) return;
  // GET /oauth/authorize is the consent page in the SPA, not an API.
  if (path === "/oauth/authorize") return;
  handleCors(event, {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "MCP-Protocol-Version"],
    maxAge: "600",
    preflight: { statusCode: 204 },
  });
});
