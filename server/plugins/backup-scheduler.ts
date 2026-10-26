/**
 * Runs scheduled world backups (Backups tab → Schedule).
 *
 * Checks every minute whether a schedule's slot has passed. The check is cheap
 * (one query); the backups themselves run sequentially inside the sweep, and
 * a sweep still busy with a long backup makes the next ticks skip.
 */

const CHECK_INTERVAL_MS = 60_000;
const STARTUP_DELAY_MS = 30_000;

export default defineNitroPlugin(() => {
  let running = false;

  async function sweep() {
    if (running) return;
    running = true;
    try {
      await runDueBackups();
    } catch (error) {
      console.error("[mcsm] Backup schedule sweep failed:", error);
    } finally {
      running = false;
    }
  }

  // unref() so the timers never keep the process alive on shutdown.
  setInterval(sweep, CHECK_INTERVAL_MS).unref?.();
  setTimeout(sweep, STARTUP_DELAY_MS).unref?.();
});
