import { z } from "zod";
import {
  processIcon,
  writeServerIcon,
  MAX_ICON_UPLOAD_BYTES,
} from "../../../utils/minecraft/icon";

/** Upload (or replace) a server's icon. Accepts any image; stores 64x64 PNG. */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const form = await readMultipartFormData(event);
  const file = form?.find((part) => part.name === "icon" || part.filename);

  if (!file || !file.data?.length) {
    throw createError({ statusCode: 400, statusMessage: "No icon file provided" });
  }

  if (file.type && !file.type.startsWith("image/")) {
    throw createError({
      statusCode: 400,
      statusMessage: "Uploaded file must be an image",
    });
  }

  if (file.data.length > MAX_ICON_UPLOAD_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Image is too large (max 5MB)",
    });
  }

  const png = await processIcon(file.data);
  await writeServerIcon(event, id, png);

  return { ok: true };
});
