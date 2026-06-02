import { z } from "zod";

/** Delete a single mod/plugin jar. With ?restart=true, restarts a running server. */

const nameSchema = z
  .string()
  .regex(/^[^/\\]+\.jar$/i, "Invalid jar name")
  .refine((name) => !name.includes(".."), "Invalid jar name");

export default defineEventHandler(async (event) => {
  const { id, name } = await useValidatedParams(event, {
    id: z.string(),
    name: nameSchema,
  });
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

  try {
    await deleteJar(id, dir, name);
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to delete jar",
    });
  }

  await recordActivity(server.volume, "jar-deleted", name);

  let restarted = false;
  if (restart === "true" && server.running) {
    try {
      await restartServer(id);
      restarted = true;
    } catch (error) {
      console.error(error);
    }
  }

  return { removed: name, restarted };
});
