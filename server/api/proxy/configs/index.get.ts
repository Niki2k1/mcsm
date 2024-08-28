export default defineEventHandler(async (event) => {
  const storage = useStorage("proxy");

  return await storage.getKeys();
});
