import { z } from "zod";

/**
 * Accept BlueMap's Mojang asset download on the user's behalf: patch
 * `accept-download: true` into core.conf (via a helper container — no EXEC on
 * the socket proxy) and apply it with `bluemap reload` over RCON.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });

  const result = await acceptMojangDownload(event, id);

  if (result === "missing") {
    // BlueMap hasn't generated its configs yet — still installing/booting.
    return { result, reloaded: false };
  }

  // Apply without a restart. RCON can fail (server booting, local dev) — the
  // UI then tells the user to restart the server instead.
  let reloaded = false;
  if (result === "patched") {
    try {
      await withRcon(event, id, (rcon) => rcon.send("bluemap reload"));
      reloaded = true;
    } catch {
      // Surface reloaded: false — a restart applies the config too.
    }
  }

  return { result, reloaded };
});
