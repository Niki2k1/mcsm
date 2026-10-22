import { z } from "zod";

export default defineEventHandler(async (event) => {
  const options = await useValidatedQuery(event, {
    host: z.string(),
    port: z.coerce.number().int().optional(),
    timeout: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val) : undefined)),
    protocolVersion: z.coerce.number().int().optional(),
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
        ...options,
        timeout: options.timeout ?? 10000,
        // 127.0.0.1 is an IP, so the pinger skips the SRV lookup.
        ...tunnel,
      });
    }

    return await useMinecraftServer({
      ...options,
      timeout: options.timeout ?? 10000,
    });
  } catch (error) {
    return createError(error as Error);
  }
});
