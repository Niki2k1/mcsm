import { describe, expect, it } from "vitest";
import { configRoots } from "../../server/utils/minecraft/locations";

describe("configRoots", () => {
  it("lets Paper servers edit config/, where paper-global.yml lives", () => {
    expect(configRoots("PAPER")).toEqual([
      "plugins",
      "config",
      "world/datapacks",
    ]);
  });

  it("gives mod servers config/ plus the world's serverconfig/", () => {
    expect(configRoots("NEOFORGE", "myworld")).toEqual([
      "config",
      "myworld/serverconfig",
      "myworld/datapacks",
    ]);
  });

  it("gives vanilla servers nothing", () => {
    expect(configRoots("VANILLA")).toEqual([]);
  });
});
