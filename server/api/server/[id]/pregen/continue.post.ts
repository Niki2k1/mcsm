import * as v from "valibot";

/** Resume a paused pre-generation task. */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );

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
