import { z } from "zod";

export default defineEventHandler(async (event) => {
  const { domain } = await useValidatedParams(event, {
    domain: z.string().min(1),
  });

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
