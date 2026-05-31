import { z } from "zod";

/**
 * Upload one or more Paper plugins. Accepts `.jar` files and `.zip` bundles
 * (only the `.jar` members of a zip are kept). The compressed upload is size
 * capped here; the extraction itself is hardened against zip bombs in
 * `extractJars`. After writing, a running server is restarted so Paper loads
 * the new plugins.
 */

// Caps the compressed request body, bounding the input to the zip-bomb guards.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const { getServer, restartServer } = useDocker();

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (server.config?.type !== "PAPER") {
    throw createError({
      statusCode: 400,
      statusMessage: "Plugins are only supported on Paper servers",
    });
  }

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
    .filter((part) => part.filename && part.data?.length)
    .map((part) => ({ filename: part.filename!, data: part.data }));

  if (!uploads.length) {
    throw createError({ statusCode: 400, statusMessage: "No files uploaded" });
  }

  // Guard again on the buffered size in case Content-Length was absent/spoofed.
  const totalBytes = uploads.reduce((sum, u) => sum + u.data.length, 0);
  if (totalBytes > MAX_UPLOAD_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: `Upload too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`,
    });
  }

  let jars: JarFile[];
  try {
    jars = extractJars(uploads);
  } catch (error) {
    if (error instanceof PluginUploadError) {
      throw createError({ statusCode: 400, statusMessage: error.message });
    }
    throw error;
  }

  if (!jars.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "No .jar plugins found in the upload",
    });
  }

  try {
    await writePlugins(id, jars);
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to write plugins",
    });
  }

  // Restart so a running server actually loads the new plugins.
  let restarted = false;
  if (server.running) {
    try {
      await restartServer(id);
      restarted = true;
    } catch (error) {
      console.error(error);
    }
  }

  return { added: jars.map((jar) => jar.name), restarted };
});
