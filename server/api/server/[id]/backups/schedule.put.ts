import * as v from "valibot";

/** Save the server's automatic backup schedule. */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );
  const input = await readValidatedBody(
    event,
    v.parser(
      v.object({
        enabled: v.boolean(),
        intervalHours: v.picklist(BACKUP_INTERVALS),
        atTime: v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
        timeZone: v.pipe(
          v.string(),
          v.check(isValidTimeZone, "Unknown time zone")
        ),
        keep: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
        onlyIfPlayed: v.boolean(),
      })
    )
  );
  const volume = await scheduleVolume(event, id);
  return saveBackupSchedule(volume, input);
});
