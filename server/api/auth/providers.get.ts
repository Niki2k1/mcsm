/**
 * Which login methods this instance supports (public). The login page only
 * shows buttons for providers that are actually configured.
 */
export default defineEventHandler(() => {
  const { oauth } = useRuntimeConfig();

  return {
    microsoft: Boolean(oauth.microsoft.clientId),
  };
});
