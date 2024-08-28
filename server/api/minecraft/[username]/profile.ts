import { z } from "zod";

export default defineEventHandler(async (event) => {
  const { username } = await useValidatedParams(event, {
    username: z.string(),
  });

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
