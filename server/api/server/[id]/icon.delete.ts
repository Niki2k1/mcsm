import { z } from "zod";
import { deleteServerIcon } from "../../../utils/minecraft/icon";

/** Remove the server's icon. Requires the container to be running. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  await deleteServerIcon(event, id);

  return { ok: true };
});
