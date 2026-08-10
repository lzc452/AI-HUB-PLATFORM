/**
 * Demo data idempotency key helpers.
 *
 * Produces deterministic keys used as `idempotency_key` column values so that
 * seed re-runs detect existing rows and skip re-inserts via ON CONFLICT clauses.
 */

/**
 * Build a structured idempotency key scoped to a domain, entity, and variant.
 *
 * Format: `demo:<domain>:<entity>:<variant>`
 *
 * @example
 *   demoIdempotency("application", "notification", "published")
 *   // => "demo:application:notification:published"
 */
export function demoIdempotency(
  domain: string,
  entity: string,
  variant: string,
): string {
  return `demo:${domain}:${entity}:${variant}`;
}
