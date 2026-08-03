import type { ActorContext } from "@ai-hub/contracts";
import type { DashboardKey } from "./dashboard.types.js";

export interface AnalyticsExportRow {
  aggregateId: string;
  occurredAt: string;
  value: number;
  requesterEmployeeId?: string | null;
  displayAnonymously?: boolean;
}

export interface AnalyticsExportRequest {
  target: DashboardKey;
  from: string;
  to: string;
}

export interface AnalyticsExportReadInput {
  actor: ActorContext;
  request: AnalyticsExportRequest;
}

export interface AnalyticsExportAudit {
  actorEmployeeId: string;
  action: string;
  exportId: string;
  details: unknown;
}

export interface AnalyticsExportRepository {
  withTransaction<T>(
    operation: (repository: AnalyticsExportRepository) => Promise<T>,
  ): Promise<T>;
  readVisibleRows(
    input: AnalyticsExportReadInput,
  ): Promise<readonly AnalyticsExportRow[]>;
  recordAudit(input: AnalyticsExportAudit): Promise<void>;
}

export interface AnalyticsExportResult {
  exportId: string;
  target: DashboardKey;
  from: string;
  to: string;
  rows: readonly {
    aggregateId: string;
    occurredAt: string;
    value: number;
    requester: string | null;
  }[];
}
