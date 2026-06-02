/**
 * First-run check (public): the client redirects to the setup wizard while no
 * account exists yet. Reveals nothing beyond "is this instance set up".
 */
export default defineEventHandler(async () => {
  return { needsSetup: await needsSetup() };
});
