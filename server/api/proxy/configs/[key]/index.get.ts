import { z } from "zod";

export default defineEventHandler(async (event) => {
  const { key } = await useValidatedParams(event, {
    key: z.string(),
  });

  const storage = useStorage("proxy");

  return await storage.getItem(key);
});
