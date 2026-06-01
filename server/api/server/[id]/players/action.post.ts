import { z } from "zod";

/**
 * Live player management via RCON — no container recreation needed.
 *
 * NOTE: these change the *running* server (its ops.json / whitelist.json in
 * the world volume). They do not update the config baseline stored in the
 * `mcsm.config` label; that's what the Configuration tab is for.
 */
export default defineEventHandler(async (event) => {
  const { id } = await useValidatedParams(event, { id: z.string() });
  const { action, name } = await useValidatedBody(event, {
    action: z.enum(["op", "deop", "whitelist-add", "whitelist-remove", "kick"]),
    // Strict Minecraft username pattern — also prevents command injection.
    name: z.string().regex(/^[A-Za-z0-9_]{1,16}$/),
  });

  const commands: Record<typeof action, string> = {
    op: `op ${name}`,
    deop: `deop ${name}`,
    "whitelist-add": `whitelist add ${name}`,
    "whitelist-remove": `whitelist remove ${name}`,
    kick: `kick ${name}`,
  };

  const response = await withRcon(event, id, (rcon) =>
    rcon.send(commands[action])
  );
  return { response };
});
