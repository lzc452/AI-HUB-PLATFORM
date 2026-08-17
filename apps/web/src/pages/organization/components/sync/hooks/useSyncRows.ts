import { useQuery } from "@tanstack/react-query";

import {
  getSyncConfig,
  listSyncRuns,
} from "../../../../../modules/auth/auth.client";
import type {
  SyncAlertSummary,
  SyncConfigData,
  SyncHealthData,
  SyncLogSummary,
  SyncStatsSummary,
  SyncTaskSummary,
} from "../constants";

const SYNC_QUERY_KEY = ["identity", "sync"];

interface SyncRowsResult {
  alerts: SyncAlertSummary[];
  config: SyncConfigData;
  health: SyncHealthData;
  logs: SyncLogSummary[];
  stats: SyncStatsSummary;
  tasks: SyncTaskSummary[];
}

/** 从 identity sync API 聚合同步运行、配置与健康指标；provider 未配置时保持错误态。 */
export function useSyncRows() {
  return useQuery<SyncRowsResult, Error>({
    queryFn: async () => {
      const runs = await listSyncRuns(20);
      const config = await getSyncConfig();
      const now = Date.now();
      const todayRuns = runs.filter(
        (run) => now - new Date(run.startedAt).getTime() < 24 * 60 * 60 * 1000,
      );
      const successfulRuns = runs.filter(
        (run) => run.status === "completed",
      ).length;
      const failedRuns = runs.filter((run) => run.status === "failed").length;
      const inProgressRuns = runs.filter(
        (run) => run.status !== "completed" && run.status !== "failed",
      ).length;
      const latestFullSync = runs.find((run) => run.mode === "daily");
      return {
        alerts: [] as SyncAlertSummary[],
        config: {
          dataSource: {
            connected: config !== null,
            name: config?.externalOrgId ?? "DingTalk",
          },
          incrementalMode: config?.enabled ? "enabled" : "disabled",
          lastFullSync: latestFullSync?.startedAt ?? "—",
          nextFullSync: config?.schedule ?? "—",
          scheduleFrequency: config?.schedule ?? "—",
          syncScope: config?.externalOrgId ?? "—",
        } satisfies SyncConfigData,
        health: {
          failed: {
            count: failedRuns,
            rate: runs.length ? failedRuns / runs.length : 0,
          },
          inProgress: {
            count: inProgressRuns,
            rate: runs.length ? inProgressRuns / runs.length : 0,
          },
          pending: { count: 0, rate: 0 },
          success: {
            count: successfulRuns,
            rate: runs.length ? successfulRuns / runs.length : 0,
          },
        } satisfies SyncHealthData,
        logs: runs.map((run) => ({
          logId: run.syncRunId,
          time: new Date(run.startedAt).toLocaleString("zh-CN", {
            hour12: false,
          }),
          message: `${run.mode} 同步：${run.status}${
            typeof run.summary === "object" && run.summary !== null
              ? `（${JSON.stringify(run.summary).slice(0, 80)}）`
              : ""
          }`,
          success: run.status === "completed",
        })),
        stats: {
          exceptionTrend: 0,
          latestFullSyncTime: latestFullSync?.startedAt ?? "—",
          latestFullSyncTrendMinutes: 0,
          pendingExceptionCount: failedRuns,
          successRate: runs.length
            ? `${Math.round((successfulRuns / runs.length) * 100)}%`
            : "—",
          successRateTrend: 0,
          todayTaskCount: todayRuns.length,
          todayTaskTrend: 0,
        } satisfies SyncStatsSummary,
        tasks: runs.map(
          (run) =>
            ({
              duration: "—",
              object: "organization",
              resultSummary:
                typeof run.summary === "object" && run.summary !== null
                  ? JSON.stringify(run.summary)
                  : "—",
              startedAt: run.startedAt,
              status:
                run.status === "completed"
                  ? "success"
                  : run.status === "failed"
                    ? "failed"
                    : "pending",
              taskId: run.syncRunId,
              taskName: `${run.mode} sync`,
              taskType: run.mode === "event" ? "incremental" : "full",
            }) satisfies SyncTaskSummary,
        ),
      };
    },
    queryKey: SYNC_QUERY_KEY,
  });
}
