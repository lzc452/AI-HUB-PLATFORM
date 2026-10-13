import type {
  AuditEventInput,
  AuditListInput,
  AuditRepository,
} from "./audit.types.js";
import type { Logger } from "pino";
import { getTraceId } from "../observability/request-context.middleware.js";

/** 统一安全审计服务：查询审计事件 + 创建导出任务（V1 排队占位）。 */
export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    /**
     * 审计写失败的告警出口。`AuditService` 本身不建pino 实例：
     * 服务类里new一个 logger 会绕过 `observability.module` 的统一配置
     * （生产环境 enabled=false 会被绕开），也让单测无法断言日志。
     * 未提供时写失败静默——不影响 recordEvent 的「永不抛错」契约。
     */
    private readonly logger?: Logger,
  ) {}

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

  async getExportJob(exportJobId: string) {
    return this.repository.findExportJob(exportJobId);
  }

  /**
   * 供关键写路径调用：统一安全审计记录。
   *
   * **永不抛错**：调用方都是审核决策、登录失败这类主流程，它们不能因为审计
   * 副产物写不进去而失败——审计的定位是「出事能查」，不是「出事就断」。
   * 写失败只记 warn，让上层不必各自包 try/catch，也不必担心「忘了 catch 把主流程搞挂」。
   *
   * 补traceId 兜底：审计事件最有价值的用法是「拿一个 traceId 把这条业务写入
   * 和同期日志串起来查」。逐个调用方传 traceId 必然有漏传的（登录失败、后台
   * 任务等非HTTP 入口更是根本没有），而漏掉就等于该事件永远无法与日志对齐。
   * `getTraceId()` 走 AsyncLocalStorage，在 HTTP 请求内取到当前值，
   * 在后台任务/无上下文场景会新生成一个 ULID——两种情况都不会抛错，
   * 且后台任务写入的孤立 traceId 恰好能在日志里自成一串。
   */
  async recordEvent(input: AuditEventInput): Promise<void> {
    const traceId = input.traceId ?? getTraceId();
    try {
      await this.repository.createEvent({ ...input, traceId });
    } catch (error) {
      this.logger?.warn(
        { err: error, module: input.module, action: input.action },
        "security audit write failed",
      );
    }
  }
}
