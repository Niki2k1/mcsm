import type { ServerSummary } from "../../utils/useDocker";


/**
 * Lists the managed Minecraft servers straight from Docker — the source of
 * truth now that provisioning is direct. Non-admins only see the servers they
 * were granted access to.
 */
export default defineEventHandler(async (event) => {
  const user = await currentUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  let servers: ServerSummary[];
  try {
    const { listServers } = useDocker(event);
    servers = await listServers();
  } catch (error) {
    // Degrade gracefully when the Docker daemon is unreachable so the
    // dashboard still renders instead of erroring.
    console.error("Failed to list servers:", error);
    return [];
  }

  if (user.admin) {
    return servers.map((server) => ({ ...server, access: "admin" as const }));
  }

  const grants = await grantsForUser(user.id);
  return servers.flatMap((server) => {
    const access = server.volume ? grants.get(server.volume) : undefined;
    return access ? [{ ...server, access }] : [];
  });
});
