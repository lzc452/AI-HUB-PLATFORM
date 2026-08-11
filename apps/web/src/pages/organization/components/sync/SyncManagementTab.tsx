import { useMemo, useState } from "react";

import {
  createDefaultSyncFilters,
  filterSyncRows,
  type SyncFilterValue,
} from "./constants";
import { SyncAlertsPanel } from "./SyncAlertsPanel";
import { SyncConfigPanel } from "./SyncConfigPanel";
import { SyncFilterBar } from "./SyncFilterBar";
import { SyncHealthPanel } from "./SyncHealthPanel";
import { SyncLogsPanel } from "./SyncLogsPanel";
import { SyncTaskTable } from "./SyncTaskTable";
import { useSyncRows } from "./hooks/useSyncRows";

/**
 * 同步状态页签容器：唯一持有筛选状态与过滤派生逻辑。
 * 数据通过 useSyncRows 获取后传入子组件；筛选状态收敛为单一对象，
 * 通过 onChange 把增量补丁回传给自身 state（props 向下、回调向上）。
 */
export function SyncManagementTab() {
  const { data, error, isPending } = useSyncRows();
  const [filters, setFilters] = useState<SyncFilterValue>(
    createDefaultSyncFilters(),
  );

  const filteredTasks = useMemo(() => {
    if (!data) return [];
    return filterSyncRows(data.tasks, filters);
  }, [data, filters]);

  if (isPending) {
    return (
      <section className="space-y-2 rounded-xl border border-solid border-[#d9d9d9] bg-white p-2 text-[13px] text-[#595959]">
        同步数据加载中…
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-2 rounded-xl border border-solid border-[#d9d9d9] bg-white p-2 text-[13px] text-[#ff4d4f]">
        同步数据加载失败：{error.message}
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-xl border border-solid border-[#d9d9d9] bg-white p-2">
      <SyncFilterBar
        value={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
      />

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_320px]">
        <SyncTaskTable rows={filteredTasks} />
        <SyncConfigPanel config={data.config} />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <SyncHealthPanel health={data.health} />
        <SyncAlertsPanel alerts={data.alerts} />
        <SyncLogsPanel logs={data.logs} />
      </div>
    </section>
  );
}
