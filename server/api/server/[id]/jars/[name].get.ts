import { z } from "zod";

/** Download a single mod/plugin jar. */

const nameSchema = z
  .string()
  .regex(/^[^/\\]+\.jar$/i, "Invalid jar name")
  .refine((name) => !name.includes(".."), "Invalid jar name");

export default defineEventHandler(async (event) => {
  const { id, name } = await useValidatedParams(event, {
    id: z.string(),
    name: nameSchema,
  });

  const { getServer } = useDocker(event);
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

  const data = await readJar(id, dir, name);

  setHeader(event, "Content-Type", "application/java-archive");
  setHeader(event, "Content-Disposition", `attachment; filename="${name}"`);
  setHeader(event, "Content-Length", data.length);
  return data;
});
