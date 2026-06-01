import { z } from "zod";

export default defineEventHandler(async (event) => {
  const { domain } = await useValidatedBody(event, {
    domain: z.string().min(1),
  });

  const domains = useDomains();

  if (await domains.has(domain)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Domain '${domain}' already exists`,
    });
  }

  await domains.add(domain);

  return {
    message: `Domain '${domain}' successfully created`,
  };
});
