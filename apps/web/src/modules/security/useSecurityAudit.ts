import { useQuery } from "@tanstack/react-query";

import { fetchSecurityAuditLogs } from "./security.client";

/**
 * 审计日志查询 hook，数据来自受保护的后端读模型。
 */
export function useSecurityAuditLogs() {
  return useQuery({
    queryFn: fetchSecurityAuditLogs,
    queryKey: ["security", "audit-logs"],
  });
}
