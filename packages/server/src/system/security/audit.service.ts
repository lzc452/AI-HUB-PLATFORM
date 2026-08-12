import type {
  AuditEventInput,
  AuditListInput,
  AuditRepository,
} from "./audit.types.js";

/** 统一安全审计服务：查询审计事件 + 创建导出任务（V1 排队占位）。 */
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async listEvents(input: AuditListInput) {
    const page = Math.max(1, input.page);
    const pageSize = Math.min(200, Math.max(1, input.pageSize));
    return this.repository.listEvents({ ...input, page, pageSize });
  }

  async createExportJob(input: {
    actorEmployeeId: string;
    filterSnapshot: unknown;
  }) {
    return this.repository.createExportJob({
      requestedByEmployeeId: input.actorEmployeeId,
      filterSnapshot: input.filterSnapshot,
    });
  }

  /** 供关键写路径调用：统一安全审计记录。 */
  async recordEvent(input: AuditEventInput): Promise<void> {
    await this.repository.createEvent(input);
  }
}
