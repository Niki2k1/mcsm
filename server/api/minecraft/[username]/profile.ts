import * as v from "valibot";

export default defineEventHandler(async (event) => {
  const { username } = await getValidatedRouterParams(
    event,
    v.parser(
      v.object({
        username: v.string(),
      })
    )
  );

  const profile = await $fetch<MinecraftProfile>(
    `https://api.mojang.com/users/profiles/minecraft/${username}`
  );

  if (!profile) {
    throw createError({
      statusCode: 404,
      statusMessage: "Player not found",
    });
  }

  return profile;
});
