import * as v from "valibot";
import { serverConfigSchema } from "../../schema/server.schema";

// The person creating the server must accept the Minecraft EULA themselves;
// only then does the spec set EULA=true on the container. Edits, duplicates
// and variants derive from a server whose creator already accepted it.
const createSchema = v.object({
  ...serverConfigSchema.entries,
  eula: v.literal(true),
});

export default defineEventHandler(async (event) => {
  const { eula: _eula, ...body } = await readValidatedBody(
    event,
    v.parser(createSchema)
  );
  const data = await assignVoicePort(event, body);

  const { provisionServer } = useDocker(event);
  const spec = await buildServerSpec(data, event, { newWorld: true });

  try {
    const container = await provisionServer({
      name: spec.name,
      image: spec.image,
      env: spec.env,
      labels: spec.labels,
      memoryBytes: spec.memoryBytes,
      port: spec.port,
      hostPort: spec.hostPort,
      voiceChat: spec.voiceChat,
      volume: spec.volume,
      restartPolicy: spec.restartPolicy,
    });

    await recordActivity(spec.volume, "created", `${data.type} server`);

    return { id: container.id, name: container.name, domain: spec.domain };
  } catch (error) {
    if (isError(error) && error.statusCode === 409) throw error;
    console.error(error);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create server",
    });
  }
});
