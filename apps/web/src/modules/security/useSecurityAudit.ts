import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createAuditExport,
  downloadAuditExport,
  fetchAuditExportStatus,
  fetchSecurityAuditLogs,
} from "./security.client";

/**
 * 审计日志查询 hook，数据来自受保护的后端读模型。
 */
export function useSecurityAuditLogs() {
  return useQuery({
    queryFn: fetchSecurityAuditLogs,
    queryKey: ["security", "audit-logs"],
  });
}

/** 审计导出任务 UI 状态机。 */
export type AuditExportUiState =
  | { phase: "idle" }
  | { phase: "polling"; exportJobId: string }
  | { phase: "completed"; exportJobId: string; expiresAt: string | null }
  | { phase: "expired"; exportJobId: string }
  | { phase: "failed"; exportJobId: string; failureCode: string | null };

const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 2_000;

/**
 * 创建审计导出并轮询其状态：
 * - completed 且未过期 → 可下载；
 * - failed / 过期 / 轮询超时 → 不提供下载入口，避免可下载假链接。
 */
export function useAuditExport() {
  const [state, setState] = useState<AuditExportUiState>({ phase: "idle" });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startExport = useCallback(
    async (filterSnapshot: unknown) => {
      stopPolling();
      const created = await createAuditExport(filterSnapshot);
      attemptsRef.current = 0;
      setState({
        phase: "polling",
        exportJobId: created.exportJobId,
      });
      timerRef.current = setInterval(() => {
        void (async () => {
          attemptsRef.current += 1;
          let status: Awaited<ReturnType<typeof fetchAuditExportStatus>>;
          try {
            status = await fetchAuditExportStatus(created.exportJobId);
          } catch {
            if (attemptsRef.current < MAX_POLL_ATTEMPTS) return;
            stopPolling();
            setState({
              phase: "failed",
              exportJobId: created.exportJobId,
              failureCode: "AUDIT_EXPORT_POLL_FAILED",
            });
            return;
          }
          if (status.status === "failed") {
            stopPolling();
            setState({
              phase: "failed",
              exportJobId: created.exportJobId,
              failureCode: status.failureCode,
            });
            return;
          }
          if (status.status === "completed") {
            const expired =
              status.expiresAt !== null &&
              new Date(status.expiresAt).getTime() <= Date.now();
            stopPolling();
            setState(
              expired
                ? { phase: "expired", exportJobId: created.exportJobId }
                : {
                    phase: "completed",
                    exportJobId: created.exportJobId,
                    expiresAt: status.expiresAt,
                  },
            );
            return;
          }
          if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
            stopPolling();
            setState({
              phase: "failed",
              exportJobId: created.exportJobId,
              failureCode: "AUDIT_EXPORT_POLL_TIMEOUT",
            });
          }
        })();
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  const download = useCallback(async (exportJobId: string) => {
    await downloadAuditExport(exportJobId);
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setState({ phase: "idle" });
  }, [stopPolling]);

  return { state, startExport, download, reset };
}
