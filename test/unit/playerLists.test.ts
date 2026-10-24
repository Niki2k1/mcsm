import { describe, expect, it } from "vitest";
import {
  dashUuid,
  offlineUuid,
  parsePlayerList,
  parseWhitelistSettings,
  setProperty,
  updatePlayerList,
} from "../../server/utils/minecraft/player-lists";

const alice = { uuid: "11111111-1111-1111-1111-111111111111", name: "Alice" };
const bob = { uuid: "22222222-2222-2222-2222-222222222222", name: "Bob" };

describe("parsePlayerList", () => {
  it("reads Minecraft's list format", () => {
    const raw = JSON.stringify([
      { ...alice, level: 4, bypassesPlayerLimit: false },
    ]);
    expect(parsePlayerList(raw)).toEqual([
      { ...alice, level: 4, bypassesPlayerLimit: false },
    ]);
  });

  it("treats a missing or broken file as empty", () => {
    expect(parsePlayerList(null)).toEqual([]);
    expect(parsePlayerList("{not json")).toEqual([]);
    expect(parsePlayerList('{"name":"x"}')).toEqual([]);
  });

  it("drops malformed entries", () => {
    expect(parsePlayerList(JSON.stringify([alice, { name: "x" }]))).toEqual([
      alice,
    ]);
  });
});

describe("updatePlayerList", () => {
  it("adds a player once", () => {
    expect(updatePlayerList([alice], "add", bob)).toEqual([alice, bob]);
    expect(updatePlayerList([alice], "add", alice)).toEqual([alice]);
  });

  it("removes by name regardless of case, without a UUID", () => {
    expect(
      updatePlayerList([alice, bob], "remove", { name: "alice", uuid: "" })
    ).toEqual([bob]);
  });
});

describe("uuids", () => {
  it("dashes Mojang's undashed ids", () => {
    expect(dashUuid("069a79f444e94726a5befca90e38aaf5")).toBe(
      "069a79f4-44e9-4726-a5be-fca90e38aaf5"
    );
  });

  it("derives the offline-mode UUID like the server does", () => {
    expect(offlineUuid("Notch")).toBe("b50ad385-829d-3141-a216-7e7d7539ba7f");
  });
});

describe("server.properties switches", () => {
  const props = "motd=hi\nwhite-list=true\nenforce-whitelist=false\n";

  it("reads the whitelist switches", () => {
    expect(parseWhitelistSettings(props)).toEqual({
      enabled: true,
      enforce: false,
    });
    expect(parseWhitelistSettings(null)).toEqual({
      enabled: false,
      enforce: false,
    });
  });

  it("replaces an existing property and keeps the rest", () => {
    expect(setProperty(props, "enforce-whitelist", "true")).toBe(
      "motd=hi\nwhite-list=true\nenforce-whitelist=true\n"
    );
  });

  it("appends a missing property", () => {
    expect(setProperty("motd=hi", "white-list", "true")).toBe(
      "motd=hi\nwhite-list=true\n"
    );
  });
});
