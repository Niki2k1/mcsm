interface MojangManifest {
  latest: { release: string; snapshot: string };
  versions: {
    id: string;
    type: "release" | "snapshot" | "old_beta" | "old_alpha";
  }[];
}

const MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

/**
 * Stable Minecraft releases, newest first, from Mojang's launcher manifest.
 * That manifest is what the itzg image resolves VERSION against, so it is
 * authoritative and lists new releases the day they ship. Cached so a Mojang
 * hiccup serves the last good list instead of an empty dropdown.
 */
export const fetchMinecraftReleases = cachedFunction(
  async () => {
    const manifest = await $fetch<MojangManifest>(MANIFEST_URL);
    return manifest.versions
      .filter((version) => version.type === "release")
      .map((version) => version.id);
  },
  { name: "minecraft-releases", getKey: () => "pc", maxAge: 60 * 60, swr: true }
);
