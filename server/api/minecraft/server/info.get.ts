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
    // Local dev: server domains have no DNS — when the host matches a managed
    // server, ping it through a dev tunnel into its container instead.
    const tunnel = await devAddressForDomain(
      event,
      options.host,
      options.port ?? 25565
    );
    if (tunnel) {
      return await useMinecraftServer({
        timeout: 10000,
        ...options,
        ...tunnel,
        // 127.0.0.1 has no SRV records — skip the lookup.
        disableSRV: true,
      });
    }

    return await useMinecraftServer({
      timeout: 10000,
      ...options,
    });
  } catch (error) {
    return createError(error as Error);
  }
});
