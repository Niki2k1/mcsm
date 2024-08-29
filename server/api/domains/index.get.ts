export default defineEventHandler(async (event) => {
  const storage = useStorage("objects");

  return (await storage.getItem("domains.json")) ?? [];
});
