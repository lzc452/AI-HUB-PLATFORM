import {
  ApartmentOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Table, Tag, Tooltip } from "antd";
import type { CSSProperties } from "react";

import {
  SYNC_OBJECT_META,
  SYNC_STATUS_META,
  SYNC_TASK_ICON_META,
  SYNC_TYPE_META,
  type SyncObject,
  type SyncTaskSummary,
} from "./constants";

interface SyncTaskTableProps {
  rows: SyncTaskSummary[];
}

/** 任务对象图标：按同步对象映射到已有 antd 图标与颜色，无自定义 SVG。 */
function TaskObjectIcon({ object }: { object: SyncObject }) {
  const meta = SYNC_TASK_ICON_META[object] ?? {
    color: "#1677ff",
    iconName: "ApartmentOutlined",
  };

  const iconClass = "text-base";
  const style: CSSProperties = { color: meta.color };

  let icon: React.ReactNode;
  switch (meta.iconName) {
    case "UserOutlined":
      icon = <UserOutlined className={iconClass} style={style} />;
      break;
    case "SafetyCertificateOutlined":
      icon = <SafetyCertificateOutlined className={iconClass} style={style} />;
      break;
    case "ApartmentOutlined":
    default:
      icon = <ApartmentOutlined className={iconClass} style={style} />;
  }

  return <span aria-hidden>{icon}</span>;
}

/** 最近同步任务表格：列定义 + 渲染。数据源完全来自入参 rows，自身不派生、不变更。 */
export function SyncTaskTable({ rows }: SyncTaskTableProps) {
  const columns = [
    {
      dataIndex: "taskName",
      render: (name: string, record: SyncTaskSummary) => (
        <div className="flex min-w-0 items-center gap-2">
          <Tooltip title={name}>
            <span className="block max-w-[120px] truncate">{name}</span>
          </Tooltip>
        </div>
      ),
      title: "任务名称",
      width: 120,
    },
    {
      dataIndex: "object",
      render: (object: SyncObject) => SYNC_OBJECT_META[object],
      title: "同步对象",
      width: 80,
    },
    {
      dataIndex: "taskType",
      render: (type: SyncTaskSummary["taskType"]) => {
        const meta = SYNC_TYPE_META[type];
        return (
          <Tag
            className="m-0 truncate"
            color={meta.color}
            style={{ maxWidth: 80 }}
            title={meta.text}
          >
            {meta.text}
          </Tag>
        );
      },
      title: "类型",
      width: 60,
    },
    {
      dataIndex: "startedAt",
      ellipsis: true,
      title: "开始时间",
      width: 100,
    },
    {
      dataIndex: "duration",
      title: "耗时",
      width: 60,
    },
    {
      dataIndex: "status",
      render: (status: SyncTaskSummary["status"]) => {
        const meta = SYNC_STATUS_META[status];
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
      title: "状态",
      width: 60,
    },
    {
      dataIndex: "resultSummary",
      ellipsis: true,
      title: "结果摘要",
      width: 80,
    },
    {
      key: "action",
      render: (_value: unknown, record: SyncTaskSummary) => (
        <div className="flex items-center gap-3 whitespace-nowrap">
          <Button className="!px-0" type="link">
            查看日志
          </Button>
          <Button className="!px-0" type="link">
            详情
          </Button>
          {record.status === "failed" ? (
            <Button className="!px-0" type="link">
              重试
            </Button>
          ) : record.status === "pending" ? (
            <Button className="!px-0" type="link">
              取消
            </Button>
          ) : null}
        </div>
      ),
      title: "操作",
      width: 160,
    },
  ];

  return (
    <div className=" border border-solid border-[#d9d9d9] rounded-xl bg-white p-2">
      <Table<SyncTaskSummary>
        className="org-table-compact"
        columns={columns}
        dataSource={rows}
        pagination={{
          pageSize: 10,
          pageSizeOptions: [10, 20, 50],
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
        }}
        locale={{
          emptyText: (
            <div className="py-8 text-[13px] text-[#595959]">
              暂无匹配任务，请调整筛选条件
            </div>
          ),
        }}
        rowKey="taskId"
        scroll={{ x: "max-content" }}
        size="small"
      />
    </div>
  );
}
