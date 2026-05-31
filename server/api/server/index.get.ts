/**
 * Lists the managed Minecraft servers straight from Docker — the source of
 * truth now that provisioning is direct.
 */
export default defineEventHandler(async () => {
  try {
    const { listServers } = useDocker();
    return await listServers();
  } catch (error) {
    // Degrade gracefully when the Docker daemon is unreachable so the
    // dashboard still renders instead of erroring.
    console.error("Failed to list servers:", error);
    return [];
  }
});
