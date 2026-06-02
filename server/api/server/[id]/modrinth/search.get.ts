import { z } from "zod";

/**
 * Search Modrinth for mods/plugins compatible with this server's loader and
 * Minecraft version.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { query, offset, loader } = await useValidatedQuery(event, {
    query: z.string().min(1).max(200),
    offset: z.coerce.number().int().min(0).default(0),
    loader: z.enum(["paper", "fabric", "forge", "neoforge"]).optional(),
  });

  const { getServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!jarsDir(server.config?.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: "This server type does not support mods or plugins",
    });
  }

  const resolvedLoader = await resolveServerLoader(server, loader);
  const gameVersion = serverGameVersion(server.config);

  const { hits, total } = await searchProjects({
    query,
    loader: resolvedLoader,
    gameVersion,
    offset,
  });

  return { hits, total, loader: resolvedLoader, gameVersion };
});
