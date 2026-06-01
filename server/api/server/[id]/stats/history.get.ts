import { z } from "zod";

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
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { range } = await useValidatedQuery(event, {
    range: z.enum(["1h", "24h", "7d"]).optional().default("24h"),
  });

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
