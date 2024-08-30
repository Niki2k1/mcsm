import Jimp from "jimp-compact";

export const cachedSkins = defineCachedFunction(
  async (username: string) => {
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

    return await overlayed.getBufferAsync(Jimp.MIME_PNG);
  },
  {
    maxAge: 60 * 60,
    name: "skins",
    getKey: (username: string) => username,
  }
);
