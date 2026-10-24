import * as v from "valibot";

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.pipe(v.string(), v.toNumber(), v.integer()) }))
  );
  if (!(await deletePersonalToken(user.id, id))) {
    throw createError({ statusCode: 404, statusMessage: "Token not found" });
  }
  return { ok: true };
});
