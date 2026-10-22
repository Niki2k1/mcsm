import * as v from "valibot";

/** Download a single mod/plugin jar. */

const nameSchema = v.pipe(
  v.string(),
  v.regex(/^[^/\\]+\.jar$/i, "Invalid jar name"),
  v.check((name) => !name.includes(".."), "Invalid jar name")
);

export default defineEventHandler(async (event) => {
  const { id, name } = await getValidatedRouterParams(
    event,
    v.parser(
      v.object({
        id: v.string(),
        name: nameSchema,
      })
    )
  );

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
