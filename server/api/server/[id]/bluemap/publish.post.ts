import { z } from "zod";

/**
 * Publish / unpublish a server's BlueMap. Published maps are viewable at
 * /map/<volume>/ without logging in — handy for sharing with players. The
 * toggle lives in app settings (keyed by volume, so it survives container
 * recreation), and the auth middleware checks it for /map requests.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { public: publish } = await useValidatedBody(event, {
    public: z.boolean(),
  });

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
