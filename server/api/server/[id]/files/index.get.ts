import * as v from "valibot";

/** List the scope roots and every file/folder the file manager may show. */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const server = await getFileManagerServer(event, id);

  try {
    return await listFiles(id, server.config?.type, server.config?.LEVEL);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to list files",
    });
  }
});
