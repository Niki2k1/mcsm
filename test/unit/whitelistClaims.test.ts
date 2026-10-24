import { describe, expect, it } from "vitest";
import {
  claimConflictMessage,
  claimPlayerKey,
  findClaimConflict,
} from "../../server/utils/whitelistClaimRules";

const claim = (claimKey: string, playerName: string) => ({
  claimKey,
  playerName,
  playerKey: claimPlayerKey(playerName),
});

describe("findClaimConflict", () => {
  const existing = [claim("discord:1", "Alice")];

  it("allows a new key claiming a free player", () => {
    expect(findClaimConflict(existing, "discord:2", "Bob")).toBeNull();
    expect(findClaimConflict([], "discord:1", "Alice")).toBeNull();
  });

  it("refuses a second claim by the same key", () => {
    expect(findClaimConflict(existing, "discord:1", "Bob")).toMatchObject({
      reason: "key-already-claimed",
      claim: { playerName: "Alice" },
    });
  });

  it("refuses the same key re-claiming its own player", () => {
    expect(findClaimConflict(existing, "discord:1", "Alice")?.reason).toBe(
      "key-already-claimed"
    );
  });

  it("refuses a player claimed by another key, ignoring case", () => {
    expect(findClaimConflict(existing, "discord:2", "aLiCe")).toMatchObject({
      reason: "player-already-claimed",
      claim: { claimKey: "discord:1" },
    });
  });

  it("treats claim keys as exact, opaque strings", () => {
    expect(findClaimConflict(existing, "DISCORD:1", "Bob")).toBeNull();
  });
});

describe("claimConflictMessage", () => {
  it("names the claimed player without exposing the other key", () => {
    const other = claim("discord:1", "Alice");
    expect(claimConflictMessage("key-already-claimed", other)).toContain(
      "Alice"
    );
    const message = claimConflictMessage("player-already-claimed", other);
    expect(message).toContain("Alice");
    expect(message).not.toContain("discord:1");
  });
});
