import { z } from "zod";
import { defu } from "defu";
import { configSchema } from "../../../../schema/config.schema";

export default defineEventHandler(async (event) => {
  const { key } = await useValidatedParams(event, {
    key: z.string(),
  });

  const body = await useValidatedBody(event, configSchema);

  const storage = useStorage("proxy");

  const currentConfig = await storage.getItem(key);
  const mergedConfig = defu(body, currentConfig);

  await storage.setItem(key, mergedConfig);

  return {
    message: "Config successfully upserted.",
  };
});
