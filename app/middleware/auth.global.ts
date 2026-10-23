/**
 * Client-side auth gate (the real enforcement is the server middleware — this
 * just routes users to the right page).
 *
 *  - no accounts yet      → everything redirects to the setup wizard
 *  - not logged in        → everything redirects to /login
 *  - logged in            → /login and /setup redirect back to the dashboard,
 *                           or to the page that sent the user to /login
 */
const PUBLIC_PAGES = ["/login", "/setup"];

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useUserSession();

  // SPA: nuxt-auth-utils fetches the session in a plugin before middleware
  // runs, so this is just a safety net (e.g. middleware re-runs after errors).
  if (!session.ready.value) {
    await session.fetch();
  }

  // First-run setup check, cached for the lifetime of the tab.
  const needsSetup = needsSetupState();
  if (needsSetup.value === null) {
    try {
      const status = await $fetch("/api/auth/setup");
      needsSetup.value = status.needsSetup;
    } catch {
      needsSetup.value = false;
    }
  }

  if (needsSetup.value) {
    return to.path === "/setup" ? undefined : navigateTo("/setup");
  }

  if (session.loggedIn.value) {
    const returnTo = takeReturnTo();
    if (returnTo && returnTo !== to.fullPath) return navigateTo(returnTo);
    // Logged in: auth pages just bounce back to the dashboard.
    return PUBLIC_PAGES.includes(to.path) ? navigateTo("/") : undefined;
  }

  if (PUBLIC_PAGES.includes(to.path)) return;
  if (to.fullPath !== "/") rememberReturnTo(to.fullPath);
  return navigateTo("/login");
});
