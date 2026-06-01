/** "5m ago", "3h ago", "2d ago" — compact relative time for feeds/lists. */
export function timeAgo(timestamp: number | string | Date): string {
  const time = new Date(timestamp).getTime();
  const seconds = Math.floor((Date.now() - time) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(time).toLocaleDateString();
}

/** "47m", "3h 12m", "2d 5h" — duration since a start time (e.g. uptime). */
export function durationSince(start: number | string | Date): string {
  const ms = Date.now() - new Date(start).getTime();
  if (ms < 0) return "—";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
