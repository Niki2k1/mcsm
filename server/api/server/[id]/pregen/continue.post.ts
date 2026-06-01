import { z } from "zod";

/** Resume a paused pre-generation task. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { getServer } = useDocker(event);
  const server = await getServer(id).catch(() => {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  });

  const response = await withRcon(event, id, chunkyContinue);

  const task = server.volume
    ? await upsertPregenTask(server.volume, { state: "running" })
    : null;

  return { response, task };
});
