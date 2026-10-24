/**
 * Fixed-window request counter. In memory is enough for a single-instance
 * app: a restart resetting the windows is harmless.
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
}) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = 0;

  function sweep(now: number) {
    // Opportunistic cleanup so keys from one-off clients don't pile up.
    if (now - lastSweep < options.windowMs) return;
    lastSweep = now;
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
  }

  function current(key: string, now: number) {
    const window = windows.get(key);
    return window && window.resetAt > now ? window : undefined;
  }

  return {
    /** Count one request; `allowed` is false once the window's limit is hit. */
    hit(key: string, now = Date.now()) {
      sweep(now);
      let window = current(key, now);
      if (!window) {
        window = { count: 0, resetAt: now + options.windowMs };
        windows.set(key, window);
      }
      window.count++;
      return {
        allowed: window.count <= options.limit,
        remaining: Math.max(0, options.limit - window.count),
        resetAt: window.resetAt,
      };
    },

    /** Whether `key` is already over its limit, without counting a request. */
    isBlocked(key: string, now = Date.now()) {
      return (current(key, now)?.count ?? 0) >= options.limit;
    },
  };
}
