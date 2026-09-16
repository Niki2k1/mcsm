import MinecraftData from "minecraft-data";

// Older entries in minecraft-data carry no releaseType, so releases are
// detected by name: snapshots are "23w45a", pre-releases "1.20-pre1"/"-rc1",
// and since the 26.x naming scheme "26.3-snapshot-8".
const PRE_RELEASE = /w|rc|pre|snapshot/;

export default defineEventHandler(async () => {
  return Object.values(MinecraftData.versionsByMinecraftVersion["pc"])
    .filter(
      (value) =>
        value.releaseType === "release" ||
        !PRE_RELEASE.test(value.minecraftVersion ?? "")
    )
    .map((value) => ({
      label: value.minecraftVersion,
      value: value.version,
    }));
});
