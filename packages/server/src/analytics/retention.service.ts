import type { AnalyticsRetentionRepository } from "./retention.types.js";
import type { AnalyticsBehaviorEventRecorder } from "./analytics.types.js";

export class AnalyticsRetentionService {
  constructor(
    private readonly repository: AnalyticsRetentionRepository,
    private readonly analyticsEvents?: AnalyticsBehaviorEventRecorder,
  ) {}

  async run(now = new Date()): Promise<{ deleted: number }> {
    const result = await this.repository.withTransaction(async (repository) => {
      const deleted = await repository.purgeExpiredEvents(now);
      await repository.recordAudit({
        action: "analytics.retention.purged",
        aggregateId: `retention:${now.toISOString().slice(0, 10)}`,
        details: { deleted, cutoff: now.toISOString(), retentionDays: 180 },
      });
      const overdue = await repository.listOverdueReviewQueues?.(now);
      return { deleted, overdue: overdue ?? [] };
    });
    for (const applicationVersionId of result.overdue) {
      try {
        await this.analyticsEvents?.record(null, {
          eventName: "review_sla_breached",
          aggregateType: "review",
          aggregateId: applicationVersionId,
          occurredAt: now.toISOString(),
          idempotencyKey: `review-sla-breached:${applicationVersionId}:${now.toISOString().slice(0, 10)}`,
          metadata: { source: "analytics.retention" },
        });
      } catch {
        // A telemetry retry on the next worker run must not abort retention.
      }
    }
    return { deleted: result.deleted };
  }
}
