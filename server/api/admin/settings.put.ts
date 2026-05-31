import { z } from "zod";

export default defineEventHandler(async (event) => {
  const body = await useValidatedBody(event, {
    publicHost: z.string().optional(),
  });

  return useSettings().set({ publicHost: (body.publicHost ?? "").trim() });
});
