import * as v from "valibot";

/**
 * Search Modrinth for mods/plugins compatible with this server's loader and
 * Minecraft version.
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { query, offset, loader } = await getValidatedQuery(
    event,
    v.parser(
      v.object({
        query: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
        offset: v.optional(
          v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(0)),
          "0"
        ),
        loader: v.optional(
          v.picklist(["paper", "fabric", "forge", "neoforge"])
        ),
      })
    )
  );

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
  const gameVersion = await serverGameVersion(server.config);

  const { hits, total } = await searchProjects({
    query,
    loader: resolvedLoader,
    gameVersion,
    offset,
  });

  return { hits, total, loader: resolvedLoader, gameVersion };
});
