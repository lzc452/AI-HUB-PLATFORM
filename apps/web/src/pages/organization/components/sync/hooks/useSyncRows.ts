import { useQuery } from "@tanstack/react-query";

import { listSyncRuns } from "../../../../../modules/auth/auth.client";
import {
  SYNC_ALERTS_MOCK_DATA,
  SYNC_CONFIG_MOCK_DATA,
  SYNC_HEALTH_MOCK_DATA,
  SYNC_STATS_MOCK_DATA,
  SYNC_TASKS_MOCK_DATA,
  type SyncAlertSummary,
  type SyncConfigData,
  type SyncHealthData,
  type SyncLogSummary,
  type SyncStatsSummary,
  type SyncTaskSummary,
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

/**
 * 同步状态页数据 hook。
 * 同步日志（logs）已接入真实同步运行记录；统计/配置等聚合数据保留 mock。
 */
export function useSyncRows() {
  return useQuery<SyncRowsResult, Error>({
    queryFn: async () => {
      const runs = await listSyncRuns(20);
      return {
        alerts: SYNC_ALERTS_MOCK_DATA,
        config: SYNC_CONFIG_MOCK_DATA,
        health: SYNC_HEALTH_MOCK_DATA,
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
        stats: SYNC_STATS_MOCK_DATA,
        tasks: SYNC_TASKS_MOCK_DATA,
      };
    },
    queryKey: SYNC_QUERY_KEY,
  });
}
