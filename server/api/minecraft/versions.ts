import MinecraftData from "minecraft-data";

export default defineEventHandler(async (event) => {
  return Object.entries(MinecraftData.versionsByMinecraftVersion["pc"])
    .filter(
      ([key, value]) =>
        value.releaseType === "release" ||
        (!value.minecraftVersion?.includes("w") &&
          !value.minecraftVersion?.includes("rc") &&
          !value.minecraftVersion?.includes("pre"))
    )
    .map(([key, value]) => ({
      label: value.minecraftVersion,
      value: value.version,
    }));
});
