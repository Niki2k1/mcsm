import * as v from "valibot";

export default defineEventHandler(async (event) => {
  const { domain } = await getValidatedRouterParams(
    event,
    v.parser(
      v.object({
        domain: v.pipe(v.string(), v.minLength(1)),
      })
    )
  );

  const domains = useDomains();

  if (!(await domains.has(domain))) {
    throw createError({
      statusCode: 400,
      statusMessage: `Domain '${domain}' does not exist`,
    });
  }

  await domains.remove(domain);

  return {
    message: `Domain '${domain}' successfully deleted`,
  };
});
