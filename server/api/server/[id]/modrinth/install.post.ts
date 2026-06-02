import { z } from "zod";

/**
 * Install a Modrinth project: resolve the newest build compatible with the
 * server's loader + Minecraft version, download it (and its required
 * dependencies) from Modrinth's CDN, and write everything into the server's
 * mods/plugins directory.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { project, loader, restart } = await useValidatedBody(event, {
    /** Modrinth project id or slug. */
    project: z.string().min(1).max(128),
    loader: z.enum(["paper", "fabric", "forge", "neoforge"]).optional(),
    restart: z.boolean().default(true),
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

  const resolvedLoader = await resolveServerLoader(server, loader);
  const gameVersion = serverGameVersion(server.config);

  // Newest compatible build of the requested project…
  const version = await findCompatibleVersion(
    project,
    resolvedLoader,
    gameVersion
  );
  if (!version) {
    throw createError({
      statusCode: 404,
      statusMessage: `No compatible build for ${resolvedLoader} ${gameVersion}`,
    });
  }

  // …plus everything it requires to run.
  const dependencies = await resolveRequiredDeps(
    version,
    resolvedLoader,
    gameVersion
  );

  const jars: JarFile[] = [];
  for (const toInstall of [version, ...dependencies]) {
    jars.push(await downloadVersionJar(toInstall));
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

  let restarted = false;
  if (restart && server.running) {
    try {
      await restartServer(id);
      restarted = true;
    } catch (error) {
      console.error(error);
    }
  }

  return {
    added: jars.map((jar, index) => ({
      filename: jar.name,
      version_number: [version, ...dependencies][index]!.version_number,
      dependency: index > 0,
    })),
    restarted,
  };
});
