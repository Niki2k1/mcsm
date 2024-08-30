import { z } from "zod";

export default defineEventHandler(async (event) => {
  const data = await useValidatedBody(event, {
    type: z.enum(["VANILLA", "FTBA", "MODPACK", "FABRIC", "FORGE"]),
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

  const { createApplication, createEnv, start } = useCoolify();

  const subdomain =
    data.subdomain ?? data.name.toLocaleLowerCase().replaceAll(" ", "-");

  try {
    const { uuid } = await createApplication({
      project_uuid: "qc488ow",
      server_uuid: "f0ggkk8",
      environment_name: "production",
      docker_registry_image_name: "itzg/minecraft-server",
      ports_exposes: "25565",
      name: data.name,
      health_check_enabled: false,
    });

    await createEnv(uuid, {
      key: "EULA",
      value: "true",
    });

    // await createEnv(uuid, {
    //   key: "MEMORY",
    //   value: data.memory,
    // });

    await createEnv(uuid, {
      key: "TYPE",
      value: data.type,
    });

    await createEnv(uuid, {
      key: "MOTD",
      value: data.MOTD,
    });

    await createEnv(uuid, {
      key: "DIFFICULTY",
      value: data.DIFFICULTY,
    });

    await createEnv(uuid, {
      key: "MAX_PLAYERS",
      value: data.MAX_PLAYERS.toString(),
    });

    await createEnv(uuid, {
      key: "ONLINE_MODE",
      value: data.ONLINE_MODE.toString(),
    });

    await createEnv(uuid, {
      key: "ALLOW_FLIGHT",
      value: data.ALLOW_FLIGHT.toString(),
    });

    data.HARDCORE &&
      (await createEnv(uuid, {
        key: "HARDCORE",
        value: data.HARDCORE.toString(),
      }));

    data.LEVEL !== "world" &&
      (await createEnv(uuid, {
        key: "LEVEL",
        value: data.LEVEL,
      }));

    data.FTB_MODPACK_ID &&
      (await createEnv(uuid, {
        key: "FTB_MODPACK_ID",
        value: data.FTB_MODPACK_ID,
      }));

    data.FTB_MODPACK_VERSION_ID &&
      (await createEnv(uuid, {
        key: "FTB_MODPACK_VERSION_ID",
        value: data.FTB_MODPACK_VERSION_ID,
      }));

    data.CF_SLUG &&
      (await createEnv(uuid, {
        key: "CF_SLUG",
        value: data.CF_SLUG,
      }));

    data.CF_API_KEY &&
      (await createEnv(uuid, {
        key: "CF_API_KEY",
        value: data.CF_API_KEY,
      }));

    data.CF_FILE_ID &&
      (await createEnv(uuid, {
        key: "CF_FILE_ID",
        value: data.CF_FILE_ID,
      }));

    data.operators.length > 0 &&
      (await createEnv(uuid, {
        key: "OPERATORS",
        value: data.operators.map((user) => user.uuid).join(","),
      }));

    data.whitelist.length > 0 &&
      (await createEnv(uuid, {
        key: "WHITELIST",
        value: data.whitelist.map((user) => user.uuid).join(","),
      }));

    data.VERSION &&
      (await createEnv(uuid, {
        key: "VERSION",
        value: data.VERSION.label,
      }));

    await start(uuid);

    await $fetch(`/api/proxy/configs/${subdomain}.${data.domain}/upsert`, {
      method: "POST",
      body: {
        domainName: `${subdomain}.${data.domain}`,
        listenTo: ":25565",
        proxyTo: `${uuid}:25565`,
        proxyProtocol: false,
        realIp: false,
        timeout: 1000,
        disconnectMessage:
          "Username: {{username}}\nNow: {{now}}\nRemoteAddress: {{remoteAddress}}\nLocalAddress: {{localAddress}}\nDomain: {{domain}}\nProxyTo: {{proxyTo}}\nListenTo: {{listenTo}}",
        onlineStatus: {
          versionName: data.VERSION?.label,
          protocolNumber: data.VERSION?.value,
          maxPlayers: data.MAX_PLAYERS,
          playersOnline: 0,
          playerSamples: [],
          motd: data.MOTD,
        },
        offlineStatus: {
          versionName: data.VERSION?.label,
          protocolNumber: data.VERSION?.value,
          maxPlayers: 0,
          playersOnline: 0,
          motd: "Server is currently offline",
        },
      },
    });
  } catch (error) {
    console.error((error as any).data);
  }
});
