const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "Today", "Yesterday", or a short date such as "3 Nov". */
export function formatDay(time: number, now: number = Date.now()): string {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS);
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
