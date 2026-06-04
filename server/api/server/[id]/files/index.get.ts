import { z } from "zod";

/** List the editable config files on a server. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

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
    return await listConfigFiles(id, server.config?.type, server.config?.LEVEL);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to list files",
    });
  }
});
