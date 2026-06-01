import { serverConfigSchema } from "../../schema/server.schema";

export default defineEventHandler(async (event) => {
  const data = await useValidatedBody(event, serverConfigSchema);

  const config = useRuntimeConfig(event);
  const { provisionServer } = useDocker(event);
  const spec = await buildServerSpec(data, event);

  try {
    const container = await provisionServer({
      name: spec.name,
      image: config.docker?.image || "itzg/minecraft-server",
      env: spec.env,
      labels: spec.labels,
      memoryBytes: spec.memoryBytes,
      port: spec.port,
      volume: spec.volume,
    });

    await recordActivity(spec.volume, "created", `${data.type} server`);

    return { id: container.id, name: container.name, domain: spec.domain };
  } catch (error) {
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create server",
    });
  }
});
