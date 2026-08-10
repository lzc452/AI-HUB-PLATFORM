/**
 * Demo data safety guard.
 *
 * Prevents demo data operations in unsafe environments:
 * - Refuses production unconditionally
 * - Refuses when DEMO_DATA_ENABLED is not explicitly "true"
 */

export function assertDemoDataSafety(config: {
  nodeEnv: string;
  demoDataEnabled?: string | undefined;
}): void {
  if (config.nodeEnv === "production") {
    throw new Error(
      "DEMO_DATA_REFUSED:PRODUCTION — seedDemoDataset is not allowed in production",
    );
  }
  if (config.demoDataEnabled !== "true") {
    throw new Error(
      "DEMO_DATA_REFUSED:NOT_ENABLED — set DEMO_DATA_ENABLED=true",
    );
  }
}

/**
 * Resolve the anchor date for demo data generation.
 *
 * Returns a Date from a user-supplied ISO string, or today in UTC as default.
 * Throws on unparseable input so misconfigured anchors fail fast.
 */
export function resolveAnchorDate(envDate?: string): Date {
  if (envDate) {
    const d = new Date(envDate);
    if (isNaN(d.getTime())) {
      throw new Error(`DEMO_ANCHOR_DATE_INVALID: ${envDate}`);
    }
    return d;
  }
  return new Date(); // today UTC
}
