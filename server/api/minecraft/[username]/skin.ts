import { z } from "zod";

/**
 * @description Get the skin of a Minecraft user and crop the head.
 */
export default defineEventHandler(async (event) => {
  const { username } = await useValidatedParams(event, {
    username: z.string(),
  });

  await setHeader(event, "Content-Type", "image/png");

  return await cachedSkins(username).catch(() => 0);
});
