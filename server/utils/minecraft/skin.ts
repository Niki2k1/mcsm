export type MinecraftProfile = {
  id: string;
  name: string;
};

export type MinecraftSession = {
  id: string;
  name: string;
  properties: { name: string; value: string }[];
  profileActions: string[];
};

export const useMinecraftSkin = async (username: string) => {
  const profile = await $fetch<MinecraftProfile>(
    `https://api.mojang.com/users/profiles/minecraft/${username}`
  );

  if (!profile) {
    throw new Error("Profile not found");
  }

  const session = await $fetch<MinecraftSession>(
    `https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}`
  );

  if (!session) {
    throw new Error("Session not found");
  }

  const textures = session.properties.find(
    (property) => property.name === "textures"
  );

  if (!textures) {
    throw new Error("Textures not found");
  }

  const decodedPayload = Buffer.from(textures.value, "base64").toString(
    "utf-8"
  );
  const parsedPayload = JSON.parse(decodedPayload);

  return parsedPayload.textures.SKIN.url;
};
