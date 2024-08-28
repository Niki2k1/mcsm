import { z } from "zod";

export const configSchema = z.object({
  domainName: z.string().optional(),
  listenTo: z.string().optional(),
  proxyTo: z.string().optional(),
  proxyProtocol: z.boolean().optional(),
  realIp: z.boolean().optional(),
  timeout: z.number().optional(),
  disconnectMessage: z.string().optional(),
  onlineStatus: z
    .object({
      versionName: z.string().optional(),
      protocolNumber: z.number().optional(),
      maxPlayers: z.number().optional(),
      playersOnline: z.number().optional(),
      playerSamples: z
        .array(
          z.object({
            name: z.string(),
            uuid: z.string(),
            ping: z.number(),
          })
        )
        .optional(),
      motd: z.string().optional(),
    })
    .optional(),
  offlineStatus: z
    .object({
      versionName: z.string().optional(),
      protocolNumber: z.number().optional(),
      maxPlayers: z.number().optional(),
      playersOnline: z.number().optional(),
      motd: z.string().optional(),
    })
    .optional(),
});
