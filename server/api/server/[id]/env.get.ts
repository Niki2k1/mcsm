import { z } from "zod";

/** Values that should never be shown in clear text in the UI. */
const SENSITIVE_KEY = /PASSWORD|TOKEN|API_KEY|SECRET/i;

export type EnvVarSource = "managed" | "custom" | "image";

/**
 * All environment variables of the server's container, classified by origin:
 *
 * - `managed` — derived from MCSM's structured config (locked in the UI;
 *   change them via the Configuration tab)
 * - `custom`  — user-defined variables from the config's customEnv list
 * - `image`   — defaults baked into the itzg image (PATH, JAVA_HOME, ...);
 *   can be overridden by adding a custom variable with the same name
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { getServer, docker } = useDocker(event);

  let server: Awaited<ReturnType<typeof getServer>>;
  try {
    server = await getServer(id);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Server not found" });
  }

  const info = await docker.getContainer(id).inspect();
  const containerEnv = info.Config?.Env ?? [];

  // Keys MCSM derives from the structured config: build the spec without the
  // custom vars — whatever remains is managed.
  const managedKeys = new Set<string>();
  if (server.config) {
    const spec = await buildServerSpec(
      { ...server.config, customEnv: [] },
      event
    );
    for (const key of Object.keys(spec.env)) managedKeys.add(key);
  }

  const customKeys = new Set(
    (server.config?.customEnv ?? []).map((entry) => entry.key.toUpperCase())
  );

  return containerEnv
    .map((entry) => {
      const separator = entry.indexOf("=");
      const key = entry.slice(0, separator);
      const value = entry.slice(separator + 1);

      const source: EnvVarSource = managedKeys.has(key)
        ? "managed"
        : customKeys.has(key.toUpperCase())
          ? "custom"
          : "image";

      return {
        key,
        value: SENSITIVE_KEY.test(key) ? "••••••••" : value,
        sensitive: SENSITIVE_KEY.test(key),
        source,
      };
    })
    .sort((a, b) => {
      // Managed first, then custom, then image defaults — alphabetical within.
      const order: Record<EnvVarSource, number> = {
        managed: 0,
        custom: 1,
        image: 2,
      };
      return order[a.source] - order[b.source] || a.key.localeCompare(b.key);
    });
});
