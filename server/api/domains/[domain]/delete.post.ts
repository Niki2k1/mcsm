import { z } from "zod";

export default defineEventHandler(async (event) => {
  const { domain } = await useValidatedParams(event, {
    domain: z.string().min(1),
  });

  const storage = useStorage("objects");

  const domains = (await storage.getItem<string[]>("domains.json")) ?? [];

  if (!domains.includes(domain)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Domain '${domain}' does not exist`,
    });
  }

  domains.splice(domains.indexOf(domain), 1);

  await storage.setItem("domains.json", domains);

  return {
    message: `Domain '${domain}' successfully deleted`,
  };
});
