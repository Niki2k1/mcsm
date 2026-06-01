import { z } from "zod";

/**
 * Start a pre-generation task: select the overworld, set center/radius, and
 * kick off Chunky. The stored task row is reset to a fresh running state.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { radius, centerX, centerZ } = await useValidatedBody(event, {
    radius: z.number().int().min(100).max(100_000),
    centerX: z.number().int().min(-30_000_000).max(30_000_000).default(0),
    centerZ: z.number().int().min(-30_000_000).max(30_000_000).default(0),
  });

  const { getServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (
    !serverTypeSupportsPregen(server.config?.type) ||
    !hasChunky(server.config?.MODRINTH_PROJECTS)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Pre-generation is not enabled for this server",
    });
  }
  if (!server.volume) {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const response = await withRcon(event, id, (rcon) =>
    chunkyStart(rcon, { centerX, centerZ, radiusBlocks: radius })
  );

  const { totalChunks } = radiusToChunkCount(radius);
  const task = await upsertPregenTask(server.volume, {
    state: "running",
    radius,
    centerX,
    centerZ,
    totalChunks,
    processedChunks: 0,
    percent: 0,
    rate: null,
    etaSeconds: null,
    currentX: null,
    currentZ: null,
    startedAt: Date.now(),
    completedAt: null,
  });

  await recordActivity(
    server.volume,
    "pregen-started",
    `Radius ${radius.toLocaleString()} blocks around ${centerX}, ${centerZ}`
  );

  return { response, task };
});
