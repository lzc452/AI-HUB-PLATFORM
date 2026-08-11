import { useQuery } from "@tanstack/react-query";

import { fetchSecurityAuditLogs } from "./security.client";

/**
 * 审计日志查询 hook。
 * demo 数据，后端暂无审计 API：queryFn 当前返回本地演示数据，
 * 待后端接口就绪后仅需调整 security.client.ts。
 */
export function useSecurityAuditLogs() {
  return useQuery({
    queryFn: fetchSecurityAuditLogs,
    queryKey: ["security", "audit-logs"],
  });
}
