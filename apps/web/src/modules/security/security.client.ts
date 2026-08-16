import { apiFetch, apiFetchBlob } from "../../shared/api/client";

/** 系统安全审计 API 客户端；列表和导出均通过受保护的后端接口完成。 */

/** 单条审计日志的详情载荷（右栏「日志详情」展示）。 */
export interface AuditLogDetail {
  /** 审计备注。 */
  auditNote: string;
  /** 详情内容 JSON（代码块逐行渲染）。 */
  detailJson: Record<string, string>;
  /** 影响范围。 */
  impactScope: string;
  /** 风险等级：低风险 / 中风险 / 高风险。 */
  riskLevel: "低风险" | "中风险" | "高风险";
}

/** 审计日志表格行。 */
export interface AuditLogRow {
  /** 操作类型（对应 ACTION_TYPE_META 的 Tag 语义）。 */
  actionType: string;
  /** 详情载荷（右栏「日志详情」展示）。 */
  detail: AuditLogDetail;
  /** 模块。 */
  module: string;
  /** 操作人部门（表格以半角括号展示，详情以全角括号展示）。 */
  operatorDepartment: string;
  /** 操作人姓名。 */
  operatorName: string;
  /** 详情摘要。 */
  summary: string;
  /** 时间，格式 YYYY-MM-DD HH:mm:ss。 */
  time: string;
  /** 追踪 ID（表格列展示，16 位十六进制）。 */
  traceId: string;
}

/** 后端统一安全审计事件。 */
export interface SecurityAuditApiEvent {
  auditEventId: string;
  traceId: string | null;
  module: string;
  action: string;
  actorEmployeeId: string | null;
  subject: string | null;
  result: string;
  risk: string;
  details: unknown;
  createdAt: string;
}

export interface SecurityAuditPage {
  items: readonly SecurityAuditApiEvent[];
  total: number;
}

/**
 * 获取审计日志列表（后端分页，V1 拉取最近 200 条，本地过滤继续生效）。
 */
export function fetchSecurityAuditLogs(): Promise<AuditLogRow[]> {
  return apiFetch<SecurityAuditPage>(
    "/internal/security/audit-logs?page=1&pageSize=200",
  ).then((page) =>
    page.items.map((event) => ({
      actionType: event.action,
      detail: {
        auditNote: "审计事件已由后端记录。",
        detailJson:
          typeof event.details === "object" && event.details !== null
            ? Object.fromEntries(
                Object.entries(event.details).map(([key, value]) => [
                  key,
                  String(value),
                ]),
              )
            : { value: String(event.details ?? "") },
        impactScope: event.subject ?? "平台安全范围",
        riskLevel:
          event.risk === "high" || event.risk === "critical"
            ? "高风险"
            : event.risk === "medium"
              ? "中风险"
              : "低风险",
      },
      module: event.module,
      operatorDepartment: "平台安全",
      operatorName: event.actorEmployeeId ?? "系统",
      summary: event.action,
      time: event.createdAt.replace("T", " ").replace(".000Z", ""),
      traceId: event.traceId ?? event.auditEventId,
    })),
  );
}

/** 创建审计导出任务。 */
export function createAuditExport(
  filterSnapshot: unknown,
): Promise<{ accepted: boolean; exportJobId: string; status: string }> {
  return apiFetch("/internal/security/audit-exports", {
    body: JSON.stringify({ filterSnapshot }),
    method: "POST",
  });
}

/** 后端审计导出任务状态（与 GET /audit-exports/:exportId 对齐）。 */
export interface AuditExportStatusApi {
  exportId: string;
  status: "queued" | "processing" | "completed" | "failed";
  resultStorageKey: string | null;
  failureCode: string | null;
  expiresAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** 查询审计导出任务状态。 */
export function fetchAuditExportStatus(
  exportJobId: string,
): Promise<AuditExportStatusApi> {
  return apiFetch<AuditExportStatusApi>(
    `/internal/security/audit-exports/${exportJobId}`,
  );
}

/** 通过统一认证 seam 下载审计导出文件并触发浏览器保存。 */
export async function downloadAuditExport(exportJobId: string): Promise<void> {
  const { blob, fileName } = await apiFetchBlob(
    `/internal/security/audit-exports/${exportJobId}/download`,
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName ?? `audit-export-${exportJobId}.jsonl`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
