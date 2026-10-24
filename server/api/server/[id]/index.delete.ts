import * as v from "valibot";

/**
 * Removes a server's container. By default the named volume (the world) is
 * kept so it can be recovered; pass `?removeVolume=true` to delete it too
 * (used by the danger zone on the server settings tab).
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { removeVolume } = await getValidatedQuery(
    event,
    v.parser(
      v.object({
        removeVolume: v.pipe(
          v.optional(v.picklist(["true", "false"])),
          v.transform((value) => value === "true")
        ),
      })
    )
  );

  try {
    const { removeServer, getServer } = useDocker(event);
    const server = await getServer(id);
    await removeServer(id, { removeVolume });
    // A kept world can come back under the same volume, so its grants stay.
    if (removeVolume && server.volume) {
      await revokeServerAccess(server.volume);
      await deleteWhitelistClaims(server.volume);
    }
    await recordActivity(
      server.volume,
      "deleted",
      removeVolume ? "Server and world volume deleted" : "World volume kept"
    );
    return { ok: true };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete server",
    });
  }
});
