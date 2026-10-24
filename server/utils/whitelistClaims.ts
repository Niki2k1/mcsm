import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@nuxthub/db";
import { apiTokens, whitelistClaims } from "../db/schema";

/**
 * One-time whitelist claims. A claim is reserved before the player is
 * whitelisted, so two concurrent requests with the same key (or for the same
 * player) can't both get through: the unique indexes settle the race.
 */

export type WhitelistClaim = {
  id: number;
  claimKey: string;
  playerName: string;
  playerUuid: string | null;
  createdAt: number;
};

function conflictError(
  reason: ClaimConflictReason,
  claim: ExistingClaim
): Error {
  return createError({
    statusCode: 409,
    statusMessage: claimConflictMessage(reason, claim),
    // Machine-readable so clients can word their own message.
    data: { reason, player: claim.playerName },
  });
}

/** Claims on a server that use this key or this player. */
function claimsTouching(volume: string, claimKey: string, playerKey: string) {
  return db
    .select()
    .from(whitelistClaims)
    .where(
      and(
        eq(whitelistClaims.volume, volume),
        or(
          eq(whitelistClaims.claimKey, claimKey),
          eq(whitelistClaims.playerKey, playerKey)
        )
      )
    );
}

/** Reserve `playerName` for `claimKey` on a server, or throw 409. */
export async function reserveWhitelistClaim(
  volume: string,
  claimKey: string,
  playerName: string,
  tokenId: number | null
) {
  const playerKey = claimPlayerKey(playerName);
  const existing = await claimsTouching(volume, claimKey, playerKey);
  const conflict = findClaimConflict(existing, claimKey, playerName);
  if (conflict) throw conflictError(conflict.reason, conflict.claim);

  try {
    const [row] = await db
      .insert(whitelistClaims)
      .values({
        volume,
        claimKey,
        playerName,
        playerKey,
        tokenId,
        createdAt: Date.now(),
      })
      .returning();
    return row!;
  } catch (error) {
    // Lost a race against a concurrent claim; report it like the check above.
    const raced = await claimsTouching(volume, claimKey, playerKey);
    const late = findClaimConflict(raced, claimKey, playerName);
    if (late) throw conflictError(late.reason, late.claim);
    throw error;
  }
}

/** Record who was actually whitelisted (Mojang's spelling and UUID). */
export async function completeWhitelistClaim(
  id: number,
  player: PlayerListEntry
) {
  await db
    .update(whitelistClaims)
    .set({
      playerName: player.name,
      playerKey: claimPlayerKey(player.name),
      playerUuid: player.uuid || null,
    })
    .where(eq(whitelistClaims.id, id));
}

/** Undo a reservation whose whitelist change failed. */
export async function dropWhitelistClaim(id: number) {
  await db.delete(whitelistClaims).where(eq(whitelistClaims.id, id));
}

export async function listWhitelistClaims(volume: string) {
  return db
    .select({
      id: whitelistClaims.id,
      claimKey: whitelistClaims.claimKey,
      playerName: whitelistClaims.playerName,
      playerUuid: whitelistClaims.playerUuid,
      createdAt: whitelistClaims.createdAt,
      tokenName: apiTokens.name,
    })
    .from(whitelistClaims)
    .leftJoin(apiTokens, eq(apiTokens.id, whitelistClaims.tokenId))
    .where(eq(whitelistClaims.volume, volume))
    .orderBy(desc(whitelistClaims.createdAt));
}

/** Release a claim so its key (and player) can be claimed again. */
export async function releaseWhitelistClaim(volume: string, id: number) {
  const deleted = await db
    .delete(whitelistClaims)
    .where(and(eq(whitelistClaims.id, id), eq(whitelistClaims.volume, volume)))
    .returning({ id: whitelistClaims.id });
  return deleted.length > 0;
}

/** Forget every claim for a world that no longer exists. */
export async function deleteWhitelistClaims(volume: string) {
  await db.delete(whitelistClaims).where(eq(whitelistClaims.volume, volume));
}
