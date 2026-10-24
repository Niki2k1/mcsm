import * as v from "valibot";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mint a personal access token. The plaintext is only ever returned here. */
export default defineEventHandler(async (event) => {
  const user = await currentUser(event);
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "Authentication required",
    });
  }
  const body = await readValidatedBody(
    event,
    v.parser(
      v.object({
        name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
        scopes: v.pipe(
          v.array(v.picklist(TOKEN_SCOPES)),
          v.minLength(1, "Pick at least one scope")
        ),
        // World volumes; omitted or null = every server the user can access.
        servers: v.optional(
          v.nullable(
            v.pipe(
              v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
              v.minLength(1, "Pick at least one server"),
              v.maxLength(1000)
            )
          ),
          null
        ),
        expiresInDays: v.optional(
          v.nullable(
            v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3650))
          ),
          null
        ),
      })
    )
  );

  // valibot types the nested arrays loosely (implicit any in callbacks).
  const servers = body.servers ? [...new Set(body.servers as string[])] : null;
  if (servers) {
    // Only servers the user can see, so a restriction can't probe for others.
    for (const volume of servers) {
      if (!(await accessLevel(user, volume))) {
        throw createError({
          statusCode: 400,
          statusMessage: `Unknown server: ${volume}`,
        });
      }
    }
  }

  return createPersonalToken(user.id, {
    name: body.name,
    scopes: [...new Set(body.scopes as TokenScope[])],
    servers,
    expiresAt: body.expiresInDays
      ? Date.now() + body.expiresInDays * DAY_MS
      : null,
  });
});
