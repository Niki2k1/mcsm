import { z } from "zod";

export default defineEventHandler(async (event) => {
  const options = await useValidatedQuery(event, {
    host: z.string(),
    port: z.number().optional(),
    timeout: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val) : undefined)),
    ping: z.boolean().optional(),
    protocolVersion: z.number().optional(),
  });

  try {
    return await useMinecraftServer({
      timeout: 1000,
      ...options,
    });
  } catch (error) {
    return createError(error as Error);
  }
});
