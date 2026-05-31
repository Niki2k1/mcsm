/** Non-secret app settings (e.g. the public address used for DNS checks). */
export default defineEventHandler(async () => {
  return useSettings().get();
});
