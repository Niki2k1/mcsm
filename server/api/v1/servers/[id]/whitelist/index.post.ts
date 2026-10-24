import * as v from "valibot";

/**
 * Whitelist a player. Idempotent without `claimKey`: adding someone who is
 * already on the list succeeds with `result: "already-whitelisted"`.
 *
 * With `claimKey` (an opaque id of the end user, e.g. `discord:<user id>`)
 * the request is a one-time claim: each key may whitelist one player per
 * server and each player can be claimed by one key; repeats get 409.
 */
export default defineEventHandler(async (event) => {
  const id = await readServerIdParam(event);
  const { name, claimKey } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        name: playerNameSchema,
        claimKey: v.optional(
          v.pipe(
            v.string(),
            v.minLength(1),
            v.maxLength(128),
            // Printable ASCII without spaces keeps keys easy to show and copy.
            v.regex(/^[\x21-\x7E]+$/, "Invalid claim key")
          )
        ),
      })
    )
  );
  const server = await requireApiServer(event, id, "players:whitelist");
  if (claimKey && !server.volume) {
    // Claims are keyed by world, like every other per-server record.
    throw createError({
      statusCode: 409,
      statusMessage: "This server has no world volume to record claims for",
    });
  }

  const claim = claimKey
    ? await reserveWhitelistClaim(
        server.volume!,
        claimKey,
        name,
        requireBearerAuth(event).tokenId
      )
    : null;

  let change: WhitelistChange;
  try {
    change = await changeWhitelist(event, id, "add", name);
  } catch (error) {
    if (claim) await dropWhitelistClaim(claim.id);
    throw error;
  }
  if (claim && change.player)
    await completeWhitelistClaim(claim.id, change.player);

  return {
    result: change.result,
    player: change.player && publicPlayer(change.player),
    // "file" = the server is stopped; the change applies on its next start.
    appliedVia: change.via,
    claim: claim && {
      claimKey: claim.claimKey,
      createdAt: claim.createdAt,
    },
  };
});
