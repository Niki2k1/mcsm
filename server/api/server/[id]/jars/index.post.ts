import { z } from "zod";

/**
 * Upload mod/plugin jars (raw .jar files or .zip bundles of jars).
 *
 * With ?restart=true (the default) a running server is restarted afterwards so
 * the new jars actually load — jars are only read at boot.
 */

// Caps the compressed request body, bounding the input to the zip-bomb guards.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { restart } = await useValidatedQuery(event, {
    restart: z.enum(["true", "false"]).default("true"),
  });

  const { getServer, restartServer } = useDocker(event);

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const dir = jarsDir(server.config?.type);
  if (!dir) {
    throw createError({
      statusCode: 400,
      statusMessage: "This server type does not support mods or plugins",
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
  const totalBytes = uploads.reduce((sum, upload) => sum + upload.data.length, 0);
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
    if (error instanceof JarUploadError) {
      throw createError({ statusCode: 400, statusMessage: error.message });
    }
    throw error;
  }

  if (!jars.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "No .jar files found in the upload",
    });
  }

  try {
    await writeJars(id, dir, jars);
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to write jars",
    });
  }

  await recordActivity(
    server.volume,
    "jars-uploaded",
    jars.map((jar) => jar.name).join(", ")
  );

  // Restart so a running server actually loads the new jars.
  let restarted = false;
  if (restart === "true" && server.running) {
    try {
      await restartServer(id);
      restarted = true;
    } catch (error) {
      console.error(error);
    }
  }

  return { added: jars.map((jar) => jar.name), restarted };
});
