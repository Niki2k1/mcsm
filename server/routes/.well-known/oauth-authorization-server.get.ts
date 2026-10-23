// Clients probe both the bare path and the path-suffixed variant (RFC 9728
// §3.1 / RFC 8414 §3.1), so both serve the same document.
export default defineEventHandler((event) => {
  setResponseHeader(event, "Cache-Control", "public, max-age=300");
  return oauthMetadata(event).authorizationServer;
});
