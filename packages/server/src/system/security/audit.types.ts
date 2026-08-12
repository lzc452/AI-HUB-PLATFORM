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

export interface AuditEventInput {
  traceId?: string | null;
  module: string;
  action: string;
  actorEmployeeId?: string | null;
  subject?: string | null;
  result: "success" | "failure" | "blocked";
  risk?: "none" | "low" | "medium" | "high" | "critical";
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: unknown;
}

export interface AuditListInput {
  keyword?: string;
  module?: string;
  action?: string;
  actorEmployeeId?: string;
  result?: "success" | "failure" | "blocked";
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
  }): Promise<{ exportJobId: string; status: string; createdAt: Date }>;
}
