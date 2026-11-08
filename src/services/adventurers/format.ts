/** Short relative time ("5m ago") for a unix-seconds timestamp. */
export function formatAgo(unixSec: number, nowSec = Date.now() / 1000): string {
  const s = Math.max(0, Math.round(nowSec - unixSec));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(unixSec * 1000).toLocaleDateString();
}
