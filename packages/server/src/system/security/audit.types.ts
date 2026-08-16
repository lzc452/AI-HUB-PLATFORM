/** 安全审计事件（security_audit_events 表映射）。 */
export interface AuditEventRecord {
  auditEventId: string;
  traceId: string | null;
  module: string;
  action: string;
  actorEmployeeId: string | null;
  subject: string | null;
  result: string;
  risk: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: unknown;
  createdAt: Date;
}

export interface AuditExportJobRecord {
  exportJobId: string;
  requestedByEmployeeId: string;
  filterSnapshot: unknown;
  status: "queued" | "processing" | "completed" | "failed";
  resultStorageKey: string | null;
  expiresAt: Date | null;
  failureCode: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface AuditEventInput {
  traceId?: string | null;
  module: string;
  action: string;
  actorEmployeeId?: string | null;
  subject?: string | null;
  result: "success" | "failure" | "denied" | "error";
  risk?: "low" | "medium" | "high" | "critical";
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: unknown;
}

export interface AuditListInput {
  keyword?: string;
  module?: string;
  action?: string;
  actorEmployeeId?: string;
  result?: "success" | "failure" | "denied" | "error";
  risk?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface AuditRepository {
  listEvents(input: AuditListInput): Promise<{
    items: readonly AuditEventRecord[];
    total: number;
  }>;
  createEvent(input: AuditEventInput): Promise<void>;
  createExportJob(input: {
    requestedByEmployeeId: string;
    filterSnapshot: unknown;
  }): Promise<AuditExportJobRecord>;
  findExportJob(exportJobId: string): Promise<AuditExportJobRecord | null>;
  claimExportJob(exportJobId: string): Promise<AuditExportJobRecord | null>;
  completeExportJob(input: {
    exportJobId: string;
    resultStorageKey: string;
    expiresAt: Date;
  }): Promise<AuditExportJobRecord | null>;
  failExportJob(input: {
    exportJobId: string;
    failureCode: string;
  }): Promise<AuditExportJobRecord | null>;
}
