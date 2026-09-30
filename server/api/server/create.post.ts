import { z } from "zod";
import { serverConfigSchema } from "../../schema/server.schema";

// The person creating the server must accept the Minecraft EULA themselves;
// only then does the spec set EULA=true on the container. Edits, duplicates
// and variants derive from a server whose creator already accepted it.
const createSchema = serverConfigSchema.extend({ eula: z.literal(true) });

export default defineEventHandler(async (event) => {
  const { eula: _eula, ...data } = await useValidatedBody(event, createSchema);

  const { provisionServer } = useDocker(event);
  const spec = await buildServerSpec(data, event);

  try {
    const container = await provisionServer({
      name: spec.name,
      image: spec.image,
      env: spec.env,
      labels: spec.labels,
      memoryBytes: spec.memoryBytes,
      port: spec.port,
      hostPort: spec.hostPort,
      volume: spec.volume,
      restartPolicy: spec.restartPolicy,
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
