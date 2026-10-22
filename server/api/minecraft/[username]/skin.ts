import * as v from "valibot";

/**
 * @description Get the skin of a Minecraft user and crop the head.
 */
export default defineEventHandler(async (event) => {
  const { username } = await getValidatedRouterParams(
    event,
    v.parser(
      v.object({
        username: v.string(),
      })
    )
  );

  await setHeader(event, "Content-Type", "image/png");

  return Buffer.from(await cachedSkins(username));
});
