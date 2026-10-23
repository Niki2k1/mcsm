/**
 * Cached first-run flag shared between the auth middleware (which checks it on
 * every navigation) and the setup page (which clears it once setup completes).
 * `null` = not checked yet this app session.
 */
export const needsSetupState = () =>
  useState<boolean | null>("needs-setup", () => null);

const RETURN_TO_KEY = "mcsm:return-to";

/**
 * Remember a page to come back to after signing in (e.g. the OAuth consent
 * screen an MCP client opened). sessionStorage instead of a query param so it
 * survives the Microsoft sign-in round trip, which always lands on `/`.
 */
export function rememberReturnTo(path: string) {
  if (import.meta.client) sessionStorage.setItem(RETURN_TO_KEY, path);
}

/** The remembered page, cleared on read. Only same-origin paths qualify. */
export function takeReturnTo(): string | null {
  if (!import.meta.client) return null;
  const path = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  return path?.startsWith("/") && !path.startsWith("//") ? path : null;
}
