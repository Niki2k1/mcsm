import { z } from "zod";
import Jimp from "jimp-compact";

/**
 * @description Get the skin of a Minecraft user and crop the head.
 */
export default defineEventHandler(async (event) => {
  const { username } = await useValidatedParams(event, {
    username: z.string(),
  });

  const skinUrl = await useMinecraftSkin(username);

  const skin = await Jimp.read(skinUrl);

  const croppedHead = skin.clone().crop(8, 8, 8, 8);
  const croppedHelm = skin
    .clone()
    .crop(40, 8, 8, 8)
    .shadow({ opacity: 0.2, size: 2, blur: 5, x: 0, y: 0 });

  const overlayed = new Jimp(8, 8);

  overlayed.composite(croppedHead, 0, 0);
  overlayed.composite(croppedHelm, 0, 0);

  overlayed.resize(256, 256, Jimp.RESIZE_NEAREST_NEIGHBOR);

  await setHeader(event, "Content-Type", "image/png");

  return await overlayed.getBufferAsync(Jimp.MIME_PNG);
});
