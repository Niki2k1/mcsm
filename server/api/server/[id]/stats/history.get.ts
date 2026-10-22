import * as v from "valibot";

const RANGES = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Sampled metrics history for a server, oldest first. Keyed by world volume,
 * so the history covers all container generations of this server.
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { range } = await getValidatedQuery(
    event,
    v.parser(
      v.object({
        range: v.optional(v.picklist(["1h", "24h", "7d"]), "24h"),
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

  if (!server.volume) return { samples: [] };

  const samples = await getStatsHistory(
    server.volume,
    Date.now() - RANGES[range]
  );
  return { samples };
});
