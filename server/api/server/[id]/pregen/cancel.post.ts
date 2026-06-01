import { z } from "zod";

/** Cancel the pre-generation task, discarding Chunky's saved progress. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { getServer } = useDocker(event);
  const server = await getServer(id).catch(() => {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  });

  const response = await withRcon(event, id, chunkyCancel);

  let task = null;
  if (server.volume) {
    task = await upsertPregenTask(server.volume, {
      state: "cancelled",
      rate: null,
      etaSeconds: null,
    });
    await recordActivity(server.volume, "pregen-cancelled");
  }

  return { response, task };
});
