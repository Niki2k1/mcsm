import * as v from "valibot";

/** Create a folder (and any missing parents). */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { path } = await readValidatedBody(
    event,
    v.parser(v.object({ path: v.pipe(v.string(), v.minLength(1)) }))
  );
  const server = await getFileManagerServer(event, id);

  try {
    const created = await createFolder(
      id,
      server.config?.type,
      server.config?.LEVEL,
      path
    );
    return { path: created };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create folder",
    });
  }
});
