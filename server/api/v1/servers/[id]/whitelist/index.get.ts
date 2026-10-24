/** The server's whitelist.json — current whether the server runs or not. */
export default defineEventHandler(async (event) => {
  const id = await readServerIdParam(event);
  await requireApiServer(event, id, "servers:read");
  const whitelist = await readPlayerList(id, "whitelist");
  return { players: whitelist.map(publicPlayer) };
});
