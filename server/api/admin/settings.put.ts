import { z } from "zod";
import type { AppSettings } from "../../utils/settings";

/**
 * Patch the global app settings. Only the keys present in the body are touched,
 * so the BlueMap panel and the public-address field can save independently
 * without clobbering each other.
 */
export default defineEventHandler(async (event) => {
  const body = await useValidatedBody(event, {
    publicHost: z.string().optional(),
    bluemap: z
      .object({
        defaultEnabled: z.boolean().optional(),
        defaultPort: z.number().int().positive().optional(),
        publicHost: z.string().optional(),
      })
      .optional(),
  });

  const patch: Partial<AppSettings> = {};

  if (body.publicHost !== undefined) patch.publicHost = body.publicHost.trim();

  if (body.bluemap !== undefined) {
    patch.bluemap = {
      ...(body.bluemap.defaultEnabled !== undefined && {
        defaultEnabled: body.bluemap.defaultEnabled,
      }),
      ...(body.bluemap.defaultPort !== undefined && {
        defaultPort: body.bluemap.defaultPort,
      }),
      ...(body.bluemap.publicHost !== undefined && {
        publicHost: body.bluemap.publicHost.trim(),
      }),
    };
  }

  return useSettings().set(patch);
});
