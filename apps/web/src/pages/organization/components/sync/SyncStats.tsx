import {
  CheckCircleFilled,
  SyncOutlined,
  WarningFilled,
} from "@ant-design/icons";

import { KpiCard } from "../../../../components/common/KpiCard";
import { type SyncStatsSummary, formatTrend } from "./constants";

interface SyncStatsProps {
  stats: SyncStatsSummary | undefined;
}

const positiveTrendClass = "text-xs text-[#52c41a]";
const negativeTrendClass = "text-xs text-[#ff4d4f]";
const neutralTrendClass = "text-xs text-[#595959]";

const EMPTY_SYNC_STATS: SyncStatsSummary = {
  exceptionTrend: 0,
  latestFullSyncTime: "—",
  latestFullSyncTrendMinutes: 0,
  pendingExceptionCount: 0,
  successRate: "—",
  successRateTrend: 0,
  todayTaskCount: 0,
  todayTaskTrend: 0,
};

/** 同步状态页 KPI 卡：数据由容器计算后整体传入，使用 KpiCard 组件。 */
export function SyncStats({ stats = EMPTY_SYNC_STATS }: SyncStatsProps) {
  const exceptionTrendClass =
    stats.exceptionTrend > 0
      ? negativeTrendClass
      : stats.exceptionTrend < 0
        ? positiveTrendClass
        : neutralTrendClass;

  const successTrendClass =
    stats.successRateTrend > 0
      ? positiveTrendClass
      : stats.successRateTrend < 0
        ? negativeTrendClass
        : neutralTrendClass;

  return (
    <section
      aria-label="同步统计"
      className="grid grid-cols-2 gap-2 md:grid-cols-3"
    >
      <KpiCard
        icon={<SyncOutlined className="text-lg text-[#1677ff]" />}
        label="今日同步任务"
        trend={formatTrend(stats.todayTaskTrend)}
        value={stats.todayTaskCount}
      />
      <KpiCard
        icon={<CheckCircleFilled className="text-lg text-[#52c41a]" />}
        label="成功率"
        trend={
          <span className={successTrendClass}>
            较昨日 {formatTrend(stats.successRateTrend, "%")}
          </span>
        }
        value={stats.successRate}
      />
      <KpiCard
        icon={<WarningFilled className="text-lg text-[#fa8c16]" />}
        label="待处理异常"
        trend={
          <span className={exceptionTrendClass}>
            较昨日 {formatTrend(stats.exceptionTrend)}
          </span>
        }
        value={stats.pendingExceptionCount}
      />
    </section>
  );
}
