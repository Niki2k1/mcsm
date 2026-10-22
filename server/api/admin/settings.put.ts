import * as v from "valibot";

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(
    event,
    v.parser(
      v.object({
        publicHost: v.optional(v.string()),
      })
    )
  );

  return useSettings().set({ publicHost: (body.publicHost ?? "").trim() });
});
