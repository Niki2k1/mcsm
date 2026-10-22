import * as v from "valibot";

/**
 * Read a single file as text for the editor. With ?download=true the raw file
 * is streamed as an attachment instead — any content, so binaries like
 * WorldEdit schematics download too.
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { path, download } = await getValidatedQuery(
    event,
    v.parser(
      v.object({
        path: v.string(),
        download: v.optional(v.picklist(["true", "false"]), "false"),
      })
    )
  );
  const server = await getFileManagerServer(event, id);
  const type = server.config?.type;
  const level = server.config?.LEVEL;

  try {
    if (download === "true") {
      const file = await openFileDownload(id, type, level, path);
      setHeader(event, "Content-Type", "application/octet-stream");
      setHeader(event, "Content-Length", file.size);
      setHeader(
        event,
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`
      );
      return sendStream(event, file.stream);
    }

    return await readConfigFile(id, type, level, path);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to read file",
    });
  }
});
