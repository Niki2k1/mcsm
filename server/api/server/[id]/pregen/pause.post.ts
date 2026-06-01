import { z } from "zod";

/** Pause the running pre-generation task (Chunky saves its progress). */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { getServer } = useDocker(event);
  const server = await getServer(id).catch(() => {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  });

  const response = await withRcon(event, id, chunkyPause);

  const task = server.volume
    ? await upsertPregenTask(server.volume, { state: "paused" })
    : null;

  return { response, task };
});
