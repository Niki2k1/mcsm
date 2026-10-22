import * as v from "valibot";

/** Upload files (text or binary, e.g. WorldEdit schematics) into a folder. */

// Uploads are buffered in memory (multipart), so keep them bounded.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const { dir } = await getValidatedQuery(
    event,
    v.parser(v.object({ dir: v.pipe(v.string(), v.minLength(1)) }))
  );
  const server = await getFileManagerServer(event, id);

  // Reject oversized uploads up front, before buffering the body into memory.
  const contentLength = Number(getRequestHeader(event, "content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `Upload too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`,
    });
  }

  const parts = await readMultipartFormData(event);
  const uploads = (parts ?? [])
    .filter((part) => part.filename && part.data)
    .map((part) => ({ filename: part.filename!, data: part.data }));

  if (!uploads.length) {
    throw createError({ statusCode: 400, statusMessage: "No files uploaded" });
  }
  // Guard again on the buffered size in case Content-Length was absent/spoofed.
  const totalBytes = uploads.reduce(
    (sum, upload) => sum + upload.data.length,
    0
  );
  if (totalBytes > MAX_UPLOAD_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `Upload too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`,
    });
  }

  let written: string[];
  try {
    written = await uploadFiles(
      id,
      server.config?.type,
      server.config?.LEVEL,
      dir,
      uploads
    );
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    console.error(error);
    throw createError({ statusCode: 500, statusMessage: "Upload failed" });
  }

  await recordActivity(server.volume, "files-uploaded", written.join(", "));
  return { written };
});
