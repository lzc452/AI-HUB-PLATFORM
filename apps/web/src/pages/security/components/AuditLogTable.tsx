import { Table, Tag, Tooltip } from "antd";
import type { TableColumnsType } from "antd";

import { EmptyBlock } from "../../../components/common";
import type { AuditLogRow } from "../../../modules/security";

import { ACTION_TYPE_META } from "./constants";

interface AuditLogTableProps {
  loading: boolean;
  onSelect: (traceId: string) => void;
  rows: AuditLogRow[];
  selectedTraceId: string | null;
}

/**
 * 审计日志表格：紧凑密度 + 选中行联动右栏详情。
 * 数据源完全来自入参 rows，自身不派生、不变更。
 */
export function AuditLogTable({
  loading,
  onSelect,
  rows,
  selectedTraceId,
}: AuditLogTableProps) {
  const columns: TableColumnsType<AuditLogRow> = [
    {
      dataIndex: "time",
      title: "时间",
      width: 150,
    },
    {
      dataIndex: "operatorName",
      render: (_: string, row: AuditLogRow) => (
        <div className="leading-[1.4]">
          <div className="text-[13px] text-[#1f1f1f]">{row.operatorName}</div>
          <div className="text-[12px] text-[#8c8c8c]">
            ({row.operatorDepartment})
          </div>
        </div>
      ),
      title: "操作人",
      width: 110,
    },
    {
      dataIndex: "actionType",
      render: (actionType: string) => (
        <Tag color={ACTION_TYPE_META[actionType] ?? "default"}>
          {actionType}
        </Tag>
      ),
      title: "操作类型",
      width: 120,
    },
    {
      dataIndex: "module",
      title: "模块",
      width: 100,
    },
    {
      dataIndex: "summary",
      ellipsis: { showTitle: false },
      render: (summary: string) => (
        <Tooltip placement="topLeft" title={summary}>
          <span className="block truncate text-[13px] text-[#1f1f1f]">
            {summary}
          </span>
        </Tooltip>
      ),
      title: "详情摘要",
    },
    {
      dataIndex: "traceId",
      title: "追踪 ID",
      width: 150,
    },
  ];

  return (
    <Table<AuditLogRow>
      aria-label="审计日志表格"
      className="security-table-compact"
      columns={columns}
      dataSource={rows}
      loading={loading}
      locale={{
        emptyText: <EmptyBlock description="未找到匹配的审计日志" />,
      }}
      onRow={(record) => ({
        onClick: () => onSelect(record.traceId),
      })}
      pagination={{
        pageSize: 10,
        pageSizeOptions: [10, 20, 50],
        showQuickJumper: true,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
      rowClassName={(record) =>
        record.traceId === selectedTraceId ? "security-row-selected" : ""
      }
      rowKey="traceId"
      size="small"
    />
  );
}
