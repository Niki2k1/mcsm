import { z } from "zod";
import { serverConfigSchema } from "../../../schema/server.schema";

/**
 * Variant targets a server can migrate to. Modpack types (FTBA,
 * AUTO_CURSEFORGE) are excluded: their installers own the volume layout and a
 * meaningful migration would need modpack ids the danger zone doesn't collect
 * — creating a fresh server is the honest path there.
 */
const MIGRATION_TARGETS = ["VANILLA", "PAPER", "FABRIC", "FORGE"] as const;

/**
 * Migrate a server to a different variant (danger zone).
 *
 * The world itself is portable — the itzg image resolves the server software
 * from the TYPE env var on boot, so switching variants means: back up, stop,
 * sweep out files only the old variant can load (its plugins/mods dir and
 * loader artifacts), then recreate the container with the new type. The old
 * setup stays restorable from the Backups tab.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { type } = await useValidatedBody(event, {
    type: z.enum(MIGRATION_TARGETS),
  });

  const { getServer, docker, ensureImage, stopServer } = useDocker(event);

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }
  if (!server.config) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no stored configuration to migrate",
    });
  }
  if (!server.volume) {
    throw createError({
      statusCode: 400,
      statusMessage: "Server has no world volume",
    });
  }
  const fromType = server.config.type;
  if (fromType === type) {
    throw createError({
      statusCode: 400,
      statusMessage: `Server is already running ${type}`,
    });
  }

  // 1. Safety net: everything (world, plugins, mods, configs) becomes a
  //    regular backup before a single file is touched.
  const backup = await createBackup(event, id, `Before migration to ${type}`);

  // 2. Stop the server while its files are swapped out.
  if (server.running) await stopServer(id);

  // 3. Remove what only the old variant can load: its jar directory (when the
  //    new variant reads a different one) and the loader artifacts the old
  //    server unpacked into the volume — a leftover Forge/Fabric install would
  //    otherwise confuse the new server's first boot.
  const oldJarsDir = jarsDir(fromType);
  const stalePaths = [
    "/data/libraries/net/fabricmc",
    "/data/libraries/net/minecraftforge",
    "/data/libraries/net/neoforged",
    "/data/fabric-server-launch.jar",
    "/data/.fabric",
    "/data/run.sh",
    "/data/run.bat",
    "/data/user_jvm_args.txt",
  ];
  if (oldJarsDir && oldJarsDir !== jarsDir(type)) {
    stalePaths.push(`/data/${oldJarsDir}`);
  }

  await ensureImage(HELPER_IMAGE);
  const { exitCode, output } = await runHelper(
    docker,
    ["sh", "-c", `rm -rf ${stalePaths.map((path) => `"${path}"`).join(" ")}`],
    [`${server.volume}:/data`]
  );
  if (exitCode !== 0) {
    console.error("[mcsm] Variant migration helper failed:", output);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to clean up the old variant's files",
    });
  }
  invalidateLoaderCache(server.volume);

  // 4. Switch the type and drop settings other variants can't use. Re-parse so
  //    configs stored by older versions pick up current defaults.
  const config = serverConfigSchema.parse({
    ...server.config,
    type,
    FTB_MODPACK_ID: null,
    FTB_MODPACK_VERSION_ID: null,
    CF_SLUG: null,
    CF_FILE_ID: null,
    SPIGET_RESOURCES: type === "PAPER" ? server.config.SPIGET_RESOURCES : null,
    MODRINTH_PROJECTS: serverTypeSupportsJars(type)
      ? server.config.MODRINTH_PROJECTS
      : null,
  });

  // 5. Recreate the container — it boots the new variant, and the itzg image
  //    downloads the matching server software on the way up.
  const result = await recreateServer(
    event,
    id,
    config,
    `${fromType} → ${type} (backup #${backup.id})`,
    "variant-changed"
  );

  return {
    id: result.id,
    name: result.name,
    domain: result.domain,
    backupId: backup.id,
  };
});
