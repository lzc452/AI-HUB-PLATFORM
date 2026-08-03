export interface AnalyticsRetentionRepository {
  withTransaction<T>(
    operation: (repository: AnalyticsRetentionRepository) => Promise<T>,
  ): Promise<T>;
  purgeExpiredEvents(now: Date): Promise<number>;
  recordAudit(input: {
    action: string;
    aggregateId: string;
    details: unknown;
  }): Promise<void>;
}
