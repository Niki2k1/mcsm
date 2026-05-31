/**
 * Lists the managed Minecraft servers straight from Docker — the source of
 * truth now that provisioning is direct. Returns the configured domains (one
 * per `infrarust.domains` entry), which the dashboard pings for live status.
 */
export default defineEventHandler(async () => {
  try {
    const { docker } = useDocker();

    const containers = await docker.listContainers({
      all: true,
      filters: { label: ["infrarust.enable=true"] },
    });

    return containers.flatMap((container) =>
      (container.Labels["infrarust.domains"] ?? "")
        .split(",")
        .map((domain) => domain.trim())
        .filter(Boolean)
    );
  } catch (error) {
    // Degrade gracefully when the Docker daemon is unreachable so the
    // dashboard still renders instead of erroring.
    console.error("Failed to list containers:", error);
    return [];
  }
});
