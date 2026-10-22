import * as v from "valibot";

/**
 * Publish / unpublish a server's BlueMap. Published maps are viewable at
 * /map/<volume>/ without logging in — handy for sharing with players. The
 * toggle lives in app settings (keyed by volume, so it survives container
 * recreation), and the auth middleware checks it for /map requests.
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { public: publish } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        public: v.boolean(),
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

  if (!server.volume) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no world volume",
    });
  }

  const settings = useSettings();
  const { publicMaps = [] } = await settings.get();

  const next = publish
    ? [...new Set([...publicMaps, server.volume])]
    : publicMaps.filter((volume) => volume !== server.volume);

  await settings.set({ publicMaps: next });

  return { volume: server.volume, public: publish };
});
