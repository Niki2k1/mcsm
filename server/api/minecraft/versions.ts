export default defineEventHandler(async () => {
  const releases = await fetchMinecraftReleases();
  return releases.map((id) => ({ label: id, value: id }));
});
