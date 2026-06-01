import { z } from "zod";

/**
 * Runs a single command against a server over RCON (used by the console).
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { command } = await useValidatedBody(event, { command: z.string() });

  const response = await withRcon(event, id, (rcon) => rcon.send(command));
  return { response };
});
