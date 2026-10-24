/**
 * Current name for a UUID. Old MCSM versions seeded whitelists from bare
 * UUIDs, and itzg then writes those entries with an empty name — the Players
 * tab can neither show nor remove them by name without this.
 *
 * Resolves to "" for UUIDs Mojang doesn't know (offline-mode players), cached
 * too so a list with such entries doesn't hit Mojang on every refresh.
 */
export const cachedProfileName = defineCachedFunction(
  async (uuid: string): Promise<string> => {
    const profile = await $fetch<MinecraftProfile | undefined>(
      `https://sessionserver.mojang.com/session/minecraft/profile/${uuid.replace(/-/g, "")}`
    ).catch(() => undefined);
    return profile?.name ?? "";
  },
  {
    maxAge: 60 * 60 * 24,
    name: "profile-names",
    getKey: (uuid: string) => uuid.toLowerCase(),
  }
);
