/**
 * Demo data time utilities.
 *
 * All helpers accept an explicit `anchor` Date so that time-relative demo data
 * can be generated from a fixed reference point, making tests reproducible.
 *
 * The `resolveAnchorDate()` function in demo-config.ts provides the default
 * anchor (today, or DEMO_ANCHOR_DATE env var).
 */

/** One day in milliseconds. */
export const DAY_MS: number = 24 * 60 * 60 * 1000;

/** One hour in milliseconds. */
export const HOUR_MS: number = 60 * 60 * 1000;

/**
 * Return a Date `n` days before the anchor.
 */
export const daysAgo = (anchor: Date, n: number): Date =>
  new Date(anchor.getTime() - n * DAY_MS);

/**
 * Return a Date `n` days after the anchor.
 */
export const daysFromNow = (anchor: Date, n: number): Date =>
  new Date(anchor.getTime() + n * DAY_MS);

/**
 * Return the anchor date as an ISO date string ("YYYY-MM-DD").
 * Suitable for `analytics_daily_aggregates.day` which stores a date string.
 */
export const todayString = (anchor: Date): string =>
  anchor.toISOString().slice(0, 10);
