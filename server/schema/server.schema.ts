import { z } from "zod";

/** The full wizard configuration for a Minecraft server. */
export const serverConfigSchema = z.object({
  type: z.enum(["VANILLA", "FTBA", "AUTO_CURSEFORGE", "PAPER", "FABRIC", "FORGE"]),
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

export type ServerConfig = z.infer<typeof serverConfigSchema>;
