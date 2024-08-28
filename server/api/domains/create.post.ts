import { z } from "zod";

export default defineEventHandler(async (event) => {
  const { domain } = await useValidatedBody(event, {
    domain: z.string().min(1),
  });

  const storage = useStorage("objects");

  const domains = (await storage.getItem<string[]>("domains")) ?? [];

  if (domains.includes(domain)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Domain '${domain}' already exists`,
    });
  }

  domains.push(domain);

  await storage.setItem("domains", domains);

  return {
    message: `Domain '${domain}' successfully created`,
  };
});
