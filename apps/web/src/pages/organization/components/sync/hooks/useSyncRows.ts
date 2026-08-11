import { useQuery } from "@tanstack/react-query";

import {
  SYNC_ALERTS_MOCK_DATA,
  SYNC_CONFIG_MOCK_DATA,
  SYNC_HEALTH_MOCK_DATA,
  SYNC_LOGS_MOCK_DATA,
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
 * 当前返回 mock 数据；后续替换为真实 API 时只需修改此 hook，子组件不感知。
 */
export function useSyncRows() {
  return useQuery<SyncRowsResult, Error>({
    queryFn: async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
      return {
        alerts: SYNC_ALERTS_MOCK_DATA,
        config: SYNC_CONFIG_MOCK_DATA,
        health: SYNC_HEALTH_MOCK_DATA,
        logs: SYNC_LOGS_MOCK_DATA,
        stats: SYNC_STATS_MOCK_DATA,
        tasks: SYNC_TASKS_MOCK_DATA,
      };
    },
    queryKey: SYNC_QUERY_KEY,
  });
}
