import * as v from "valibot";

/** Mint a personal access token. The plaintext is only ever returned here. */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { name, scopes } = await readValidatedBody(
    event,
    v.parser(
      v.object({
        name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
        scopes: v.pipe(
          v.array(v.picklist(MCP_SCOPES)),
          v.minLength(1, "Pick at least one scope")
        ),
      })
    )
  );
  return createPersonalToken(user.id, name, [...new Set(scopes)]);
});
