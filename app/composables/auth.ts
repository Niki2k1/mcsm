/**
 * Cached first-run flag shared between the auth middleware (which checks it on
 * every navigation) and the setup page (which clears it once setup completes).
 * `null` = not checked yet this app session.
 */
export const needsSetupState = () =>
  useState<boolean | null>("needs-setup", () => null);
