import { Descriptions, Modal, Table, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";

import { useSyncRunItems } from "../../../../modules/auth/useIdentity";
import { getSyncRun } from "../../../../modules/auth/auth.client";
import type { SyncTaskSummary } from "./constants";

interface SyncRunModalProps {
  mode: "detail" | "logs";
  onClose: () => void;
  open: boolean;
  task: SyncTaskSummary | null;
}

export function SyncRunModal({ mode, onClose, open, task }: SyncRunModalProps) {
  const runQuery = useQuery({
    queryFn: () => getSyncRun(task!.taskId),
    queryKey: ["identity", "sync-run", task?.taskId],
    enabled: task !== null && open,
  });
  const run = runQuery.data;
  const items = useSyncRunItems(task?.taskId);

  return (
    <Modal
      footer={null}
      onCancel={onClose}
      open={open}
      title={mode === "detail" ? "同步详情" : "同步日志"}
      width={760}
    >
      {run ? (
        <Descriptions
          column={2}
          items={[
            { key: "syncRunId", label: "运行 ID", children: run.syncRunId },
            { key: "mode", label: "模式", children: run.mode },
            { key: "status", label: "状态", children: <Tag>{run.status}</Tag> },
            {
              key: "startedAt",
              label: "开始时间",
              children: run.startedAt,
            },
            {
              key: "completedAt",
              label: "结束时间",
              children: run.completedAt ?? "—",
            },
          ]}
          size="small"
        />
      ) : null}
      <Table
        columns={[
          { dataIndex: "objectType", title: "对象类型" },
          { dataIndex: "objectId", title: "对象 ID" },
          { dataIndex: "status", title: "状态" },
          { dataIndex: "processedCount", title: "处理数" },
          { dataIndex: "successCount", title: "成功数" },
          { dataIndex: "failureCount", title: "失败数" },
          { dataIndex: "errorCode", title: "错误码" },
        ]}
        dataSource={items.data ?? []}
        loading={items.isPending}
        pagination={false}
        rowKey="syncRunItemId"
        size="small"
      />
    </Modal>
  );
}
