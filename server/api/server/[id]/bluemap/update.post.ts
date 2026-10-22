import * as v from "valibot";

/**
 * Flush the world to disk (`save-all`) and have BlueMap rescan + re-render
 * everything that changed (`bluemap update`). Returns the fresh render status
 * so the UI can show progress immediately.
 *
 * Used by the Map tab's "Update map" button; the same logic runs automatically
 * when pre-generation completes.
 */
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(
    event,
    v.parser(v.object({ id: v.string() }))
  );

  return await triggerBluemapUpdate(event, id);
});
