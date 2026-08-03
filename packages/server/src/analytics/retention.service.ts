import type { AnalyticsRetentionRepository } from "./retention.types.js";

export class AnalyticsRetentionService {
  constructor(private readonly repository: AnalyticsRetentionRepository) {}

  async run(now = new Date()): Promise<{ deleted: number }> {
    return this.repository.withTransaction(async (repository) => {
      const deleted = await repository.purgeExpiredEvents(now);
      await repository.recordAudit({
        action: "analytics.retention.purged",
        aggregateId: `retention:${now.toISOString().slice(0, 10)}`,
        details: { deleted, cutoff: now.toISOString(), retentionDays: 180 },
      });
      return { deleted };
    });
  }
}
