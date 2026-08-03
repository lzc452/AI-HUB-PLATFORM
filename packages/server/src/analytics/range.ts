const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export function assertAnalyticsRange(
  from: string,
  to: string,
  now = new Date(),
): void {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const latestExclusive = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const earliest = new Date(latestExclusive.getTime() - RETENTION_MS);
  if (
    Number.isNaN(fromDate.getTime()) ||
    Number.isNaN(toDate.getTime()) ||
    fromDate >= toDate ||
    toDate.getTime() - fromDate.getTime() > RETENTION_MS ||
    fromDate < earliest ||
    toDate > latestExclusive
  ) {
    throw new Error("ANALYTICS_RANGE_INVALID");
  }
}
