export default defineEventHandler(async () => {
  return useDomains().list();
});
