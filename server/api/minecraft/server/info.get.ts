import * as v from "valibot";

export default defineEventHandler(async (event) => {
  const options = await getValidatedQuery(
    event,
    v.parser(
      v.object({
        host: v.string(),
        port: v.optional(v.pipe(v.string(), v.toNumber(), v.integer())),
        timeout: v.pipe(
          v.optional(v.string()),
          v.transform((val) => (val ? parseInt(val) : undefined))
        ),
        protocolVersion: v.optional(
          v.pipe(v.string(), v.toNumber(), v.integer())
        ),
      })
    )
  );

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
