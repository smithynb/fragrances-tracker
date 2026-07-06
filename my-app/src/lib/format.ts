/**
 * Formats a wear-log timestamp as e.g. "Jun 14" (current year) or
 * "Jan 5, 2025" (other years). Pass { weekday: true } to prepend a short
 * weekday, e.g. "Mon, Jan 5, 2025".
 */
export function formatWearDate(timestamp: number, opts: { weekday?: boolean } = {}): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString("en-US", {
    weekday: opts.weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

/** Formats a wear-log timestamp as e.g. "2:30 PM". */
export function formatWearTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
