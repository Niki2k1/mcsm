/**
 * Lightweight health snapshot for the admin dashboard: whether MCSM can reach
 * the Docker daemon (via the socket proxy) and how many managed servers exist.
 */
export default defineEventHandler(async () => {
  const { docker, listServers } = useDocker();

  let dockerOk = false;
  let version: string | undefined;
  let servers = 0;
  let running = 0;

  try {
    await docker.ping();
    dockerOk = true;

    try {
      version = (await docker.version()).Version;
    } catch {
      // Version may be blocked by the socket proxy ACL — not fatal.
    }

    const list = await listServers();
    servers = list.length;
    running = list.filter((s) => s.running).length;
  } catch (error) {
    console.error("Docker status check failed", error);
  }

  return { dockerOk, version, servers, running };
});
