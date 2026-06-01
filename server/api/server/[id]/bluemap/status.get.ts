import { z } from "zod";

/**
 * BlueMap status for a server: whether the type supports it, whether it's
 * enabled in the config, and whether the map is actually serving (BlueMap only
 * starts its webserver once the Mojang asset download has been accepted).
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { getServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const supported = serverTypeSupportsBluemap(server.config?.type);
  const enabled = supported && server.config?.BLUEMAP === true;

  // The map is "ready" when BlueMap's webserver answers — which it only does
  // after install + accepted asset download. Unreachable in local dev (the
  // container name doesn't resolve from the host) — degrades to false.
  const ready =
    enabled && server.running && server.containerName
      ? await probeBluemap(server.containerName)
      : false;

  return {
    supported,
    enabled,
    running: server.running,
    ready,
    mapPath: server.volume ? `/map/${server.volume}/` : null,
  };
});
