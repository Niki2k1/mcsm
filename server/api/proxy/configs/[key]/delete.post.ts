import { z } from "zod";
import { configSchema } from "../../../../schema/config.schema";

export default defineEventHandler(async (event) => {
  const { key } = await useValidatedParams(event, {
    key: z.string(),
  });

  const storage = useStorage("proxy");

  await storage.removeItem(key);

  return {
    message: "Config successfully removed.",
  };
});
