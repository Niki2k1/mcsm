import * as v from "valibot";

/** The server's automatic backup schedule, with the time of the next run. */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const volume = await scheduleVolume(event, id);
  return getBackupSchedule(volume);
});
