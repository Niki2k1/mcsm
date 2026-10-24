/**
 * Pure rules for one-time whitelist claims (see whitelistClaims.ts), kept free
 * of database imports so they can be unit-tested.
 */

export type ClaimConflictReason =
  | "key-already-claimed"
  | "player-already-claimed";

export type ExistingClaim = {
  claimKey: string;
  playerName: string;
  playerKey: string;
};

/** Minecraft names are case-insensitive, so claims compare lower-cased. */
export const claimPlayerKey = (name: string) => name.toLowerCase();

/**
 * Why `claimKey` may not claim `playerName` given the server's existing
 * claims, or null if it may. A key that already claimed someone is refused
 * even for the same player, so retries surface what was claimed instead of
 * silently succeeding.
 */
export function findClaimConflict(
  existing: readonly ExistingClaim[],
  claimKey: string,
  playerName: string
): { reason: ClaimConflictReason; claim: ExistingClaim } | null {
  const byKey = existing.find((claim) => claim.claimKey === claimKey);
  if (byKey) return { reason: "key-already-claimed", claim: byKey };
  const playerKey = claimPlayerKey(playerName);
  const byPlayer = existing.find((claim) => claim.playerKey === playerKey);
  if (byPlayer) return { reason: "player-already-claimed", claim: byPlayer };
  return null;
}

export function claimConflictMessage(
  reason: ClaimConflictReason,
  claim: ExistingClaim
) {
  return reason === "key-already-claimed"
    ? `This claim key already whitelisted ${claim.playerName}`
    : `${claim.playerName} was already claimed by someone else`;
}
