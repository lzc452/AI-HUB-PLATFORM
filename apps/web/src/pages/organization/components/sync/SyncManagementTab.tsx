import { useMemo, useState } from "react";
import { Modal } from "antd";

import {
  useCancelSyncRun,
  useRetrySyncRun,
  useTriggerSync,
} from "../../../../modules/auth/useIdentity";
import {
  createDefaultSyncFilters,
  filterSyncRows,
  type SyncFilterValue,
  type SyncTaskSummary,
} from "./constants";
import { SyncAlertsPanel } from "./SyncAlertsPanel";
import { SyncConfigPanel } from "./SyncConfigPanel";
import { SyncFilterBar } from "./SyncFilterBar";
import { SyncHealthPanel } from "./SyncHealthPanel";
import { SyncLogsPanel } from "./SyncLogsPanel";
import { SyncRunModal } from "./SyncRunModal";
import { SyncTaskTable } from "./SyncTaskTable";
import { useSyncRows } from "./hooks/useSyncRows";

interface SyncModalState {
  mode: "detail" | "logs";
  task: SyncTaskSummary;
}

export function SyncManagementTab() {
  const { data, error, isPending } = useSyncRows();
  const [filters, setFilters] = useState<SyncFilterValue>(
    createDefaultSyncFilters(),
  );
  const [modalState, setModalState] = useState<SyncModalState | null>(null);
  const triggerSync = useTriggerSync();
  const retrySync = useRetrySyncRun();
  const cancelSync = useCancelSyncRun();

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

  const exportLogs = () => {
    const rows = (data?.logs ?? []).map((log) => ({
      时间: log.time,
      日志: log.message,
      结果: log.success ? "成功" : "失败",
    }));
    const csv = [
      ["时间", "日志", "结果"],
      ...rows.map((row) => [row.时间, row.日志, row.结果]),
    ]
      .map((row) =>
        row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sync-logs-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-2 rounded-xl bg-white p-2">
      <SyncFilterBar
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onExportLogs={exportLogs}
        onFullSync={() => triggerSync.mutate()}
        onRetryFailed={() => {
          const failed = data?.tasks.find((task) => task.status === "failed");
          if (failed !== undefined) {
            retrySync.mutate(failed.taskId);
          } else {
            Modal.info({ content: "当前没有失败任务", title: "无需重试" });
          }
        }}
        value={filters}
      />

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_320px]">
        <SyncTaskTable
          onCancel={(task) => {
            Modal.confirm({
              content: `确认取消任务「${task.taskName}」吗？`,
              onOk: () => cancelSync.mutate(task.taskId),
              title: "取消同步",
            });
          }}
          onDetail={(task) => setModalState({ mode: "detail", task })}
          onLogs={(task) => setModalState({ mode: "logs", task })}
          onRetry={(task) => retrySync.mutate(task.taskId)}
          rows={filteredTasks}
        />
        <SyncConfigPanel config={data.config} />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <SyncHealthPanel health={data.health} />
        <SyncAlertsPanel alerts={data.alerts} />
        <SyncLogsPanel logs={data.logs} />
      </div>

      <SyncRunModal
        mode={modalState?.mode ?? "detail"}
        onClose={() => setModalState(null)}
        open={modalState !== null}
        task={modalState?.task ?? null}
      />
    </section>
  );
}
