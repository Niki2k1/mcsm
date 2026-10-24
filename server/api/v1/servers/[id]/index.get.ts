/** Status of one server: whether it runs, accepts commands and who is online. */
export default defineEventHandler(async (event) => {
  const id = await readServerIdParam(event);
  const server = await requireApiServer(event, id, "servers:read");
  const players = await getPlayerOverview(event, id);

  return {
    ...publicServer(server),
    // False while stopped or still booting (RCON not reachable yet).
    ready: !players.offline,
    players: {
      online: players.online.map((player) => player.name),
      count: players.online.length,
    },
  };
});
