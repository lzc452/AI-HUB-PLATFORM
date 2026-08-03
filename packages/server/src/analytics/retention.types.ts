export interface AnalyticsRetentionRepository {
  withTransaction<T>(
    operation: (repository: AnalyticsRetentionRepository) => Promise<T>,
  ): Promise<T>;
  purgeExpiredEvents(now: Date): Promise<number>;
  listOverdueReviewQueues?(now: Date): Promise<readonly string[]>;
  recordAudit(input: {
    action: string;
    aggregateId: string;
    details: unknown;
  }): Promise<void>;
}
