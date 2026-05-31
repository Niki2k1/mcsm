import { z } from "zod";

const MC_PORT = 25565;

/** "2GB" -> { heap: "2G", limitBytes: 3 GiB } (heap + 1 GiB headroom). */
function parseMemory(memory: string) {
  const gb = parseInt(memory, 10) || 2;
  return {
    heap: `${gb}G`,
    limitBytes: (gb + 1) * 1024 ** 3,
  };
}

/** Make a value safe to use as a Docker container/volume name. */
function sanitize(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default defineEventHandler(async (event) => {
  const data = await useValidatedBody(event, {
    type: z.enum([
      "VANILLA",
      "FTBA",
      "AUTO_CURSEFORGE",
      "PAPER",
      "FABRIC",
      "FORGE",
    ]),
    name: z.string(),
    domain: z.string(),
    subdomain: z.string().nullable(),
    VERSION: z
      .object({
        label: z.string(),
        value: z.number(),
      })
      .nullable(),
    memory: z.string(),
    MOTD: z.string(),
    DIFFICULTY: z.string(),
    MAX_PLAYERS: z.number(),
    ONLINE_MODE: z.boolean(),
    ALLOW_FLIGHT: z.boolean(),
    operators: z.array(z.object({ name: z.string(), uuid: z.string() })),
    whitelist: z.array(z.object({ name: z.string(), uuid: z.string() })),
    HARDCORE: z.boolean(),
    LEVEL: z.string(),
    FTB_MODPACK_ID: z.string().nullable(),
    FTB_MODPACK_VERSION_ID: z.string().nullable(),
    CF_SLUG: z.string().nullable(),
    CF_API_KEY: z.string().nullable(),
    CF_FILE_ID: z.string().nullable(),
  });

  const config = useRuntimeConfig();
  const { provisionServer } = useDocker();

  const subdomain = sanitize(data.subdomain ?? data.name);
  const domain = `${subdomain}.${data.domain}`;
  const memory = parseMemory(data.memory);

  // Environment for itzg/minecraft-server. Optional values are only set when
  // present, matching the image's "leave unset for default" convention.
  const env: Record<string, string> = {
    EULA: "true",
    TYPE: data.type,
    MEMORY: memory.heap,
    MOTD: data.MOTD,
    DIFFICULTY: data.DIFFICULTY,
    MAX_PLAYERS: data.MAX_PLAYERS.toString(),
    ONLINE_MODE: data.ONLINE_MODE.toString(),
    ALLOW_FLIGHT: data.ALLOW_FLIGHT.toString(),
  };

  if (data.HARDCORE) env.HARDCORE = "true";
  if (data.LEVEL !== "world") env.LEVEL = data.LEVEL;
  if (data.FTB_MODPACK_ID) env.FTB_MODPACK_ID = data.FTB_MODPACK_ID;
  if (data.FTB_MODPACK_VERSION_ID)
    env.FTB_MODPACK_VERSION_ID = data.FTB_MODPACK_VERSION_ID;
  if (data.CF_SLUG) env.CF_SLUG = data.CF_SLUG;
  if (data.CF_API_KEY) env.CF_API_KEY = data.CF_API_KEY;
  if (data.CF_FILE_ID) env.CF_FILE_ID = data.CF_FILE_ID;
  if (data.operators.length > 0)
    env.OPERATORS = data.operators.map((user) => user.uuid).join(",");
  if (data.whitelist.length > 0)
    env.WHITELIST = data.whitelist.map((user) => user.uuid).join(",");
  if (data.VERSION) env.VERSION = data.VERSION.label;

  // Infrarust discovers the container by these labels and routes the domain to
  // it — no proxy config file required.
  const labels: Record<string, string> = {
    "infrarust.enable": "true",
    "infrarust.domains": domain,
    "infrarust.port": MC_PORT.toString(),
    "infrarust.proxy_mode": "passthrough",
  };

  try {
    const container = await provisionServer({
      name: `mc-${subdomain}`,
      image: config.docker?.image || "itzg/minecraft-server",
      env,
      labels,
      memoryBytes: memory.limitBytes,
      port: MC_PORT,
      volume: `mc-${subdomain}`,
    });

    return {
      id: container.id,
      name: container.name,
      domain,
    };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create server",
    });
  }
});
