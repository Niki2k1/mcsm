import { z } from "zod";

/**
 * Read a single config file as text. With ?download=true the content is sent
 * as a file attachment instead of JSON.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { path, download } = await useValidatedQuery(event, {
    path: z.string(),
    download: z.enum(["true", "false"]).default("false"),
  });

  const { getServer } = useDocker(event);
  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  if (!serverTypeSupportsJars(server.config?.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: "This server type does not support config editing",
    });
  }

  try {
    const file = await readConfigFile(id, server.config?.type, path);

    if (download === "true") {
      const filename = file.path.split("/").pop() ?? "config";
      setHeader(event, "Content-Type", "text/plain; charset=utf-8");
      setHeader(event, "Content-Disposition", `attachment; filename="${filename}"`);
      return file.content;
    }

    return file;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to read file",
    });
  }
});
