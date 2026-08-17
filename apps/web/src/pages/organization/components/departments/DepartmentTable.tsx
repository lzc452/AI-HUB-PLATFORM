import { ApartmentOutlined, DownOutlined } from "@ant-design/icons";
import { Avatar, Button, Dropdown, Table, Tag, Tooltip } from "antd";

import {
  DEFAULT_EXPANDED_DEPARTMENT_IDS,
  DEPARTMENT_SOURCE_META,
  DEPARTMENT_STATUS_META,
  buildDepartmentTree,
  type DepartmentRow,
  type DepartmentTreeNode,
} from "./constants";

interface DepartmentTableProps {
  /** 已过滤的扁平部门行（祖先行已由过滤逻辑保留）。 */
  rows: DepartmentRow[];
  /** 部门 ID → 部门名称，用于渲染「上级部门」列。 */
  parentNameMap: Map<string, string>;
  onDelete: (row: DepartmentRow) => void;
  onDisable: (row: DepartmentRow) => void;
  onEdit: (row: DepartmentRow) => void;
  onMembers: (row: DepartmentRow) => void;
  onSync: (row: DepartmentRow) => void;
}

/** 部门表格：树形列定义 + 渲染。数据源完全来自入参 rows，自身不派生、不变更。 */
export function DepartmentTable({
  rows,
  parentNameMap,
  onDelete,
  onDisable,
  onEdit,
  onMembers,
  onSync,
}: DepartmentTableProps) {
  const treeData = buildDepartmentTree(rows);

  const columns = [
    {
      dataIndex: "name",
      key: "name",
      render: (name: string) => (
        <div className="flex min-w-0 items-center gap-2">
          <ApartmentOutlined className="text-base text-[#1677ff]" />
          <Tooltip title={name}>
            <span className="block max-w-[160px] truncate">{name}</span>
          </Tooltip>
        </div>
      ),
      title: "部门名称",
      width: 220,
    },
    {
      dataIndex: "parentDepartmentId",
      key: "parentDepartmentId",
      render: (parentId: string | null) => {
        const parentName = parentId ? parentNameMap.get(parentId) : undefined;
        return (
          <Tooltip title={parentName}>
            <span className="block max-w-[120px] truncate">
              {parentName ?? "—"}
            </span>
          </Tooltip>
        );
      },
      title: "上级部门",
      width: 140,
    },
    {
      dataIndex: "leader",
      key: "leader",
      render: (leader: string) => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar className="bg-[#1677ff] text-xs" size="small">
            {leader.charAt(0)}
          </Avatar>
          <Tooltip title={leader}>
            <span className="block max-w-[80px] truncate">{leader}</span>
          </Tooltip>
        </div>
      ),
      title: "部门负责人",
      width: 130,
    },
    {
      dataIndex: "memberCount",
      key: "memberCount",
      title: "成员数",
      width: 80,
    },
    {
      dataIndex: "applicationCount",
      key: "applicationCount",
      title: "关联应用",
      width: 90,
    },
    {
      dataIndex: "status",
      key: "status",
      render: (status: DepartmentRow["status"]) => {
        const meta = DEPARTMENT_STATUS_META[status];
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
      title: "状态",
      width: 80,
    },
    {
      dataIndex: "source",
      key: "source",
      render: (source: DepartmentRow["source"]) => {
        const meta = DEPARTMENT_SOURCE_META[source];
        return (
          <span className="text-[13px]" style={{ color: meta.color }}>
            {meta.text}
          </span>
        );
      },
      title: "数据来源",
      width: 90,
    },
    {
      dataIndex: "lastSyncAt",
      key: "lastSyncAt",
      ellipsis: true,
      title: "最近同步",
      width: 150,
    },
    {
      key: "action",
      render: (_value: unknown, row: DepartmentTreeNode) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Button className="!px-0" onClick={() => onEdit(row)} type="link">
            编辑
          </Button>
          <Button className="!px-0" onClick={() => onMembers(row)} type="link">
            查看成员
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: "sync", label: "立即同步", onClick: () => onSync(row) },
                { key: "disable", label: "停用", onClick: () => onDisable(row) },
                { key: "delete", label: "删除", onClick: () => onDelete(row) },
              ],
            }}
          >
            <Button className="!px-0" type="link">
              更多 <DownOutlined className="text-xs" />
            </Button>
          </Dropdown>
        </div>
      ),
      title: "操作",
      width: 220,
    },
  ];

  return (
    <Table<DepartmentTreeNode>
      className="org-table-compact"
      columns={columns}
      dataSource={treeData}
      defaultExpandAllRows={false}
      defaultExpandedRowKeys={DEFAULT_EXPANDED_DEPARTMENT_IDS}
      pagination={{
        pageSize: 10,
        pageSizeOptions: [10, 20, 50],
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
      rowKey="departmentId"
      scroll={{ x: "max-content" }}
      size="small"
    />
  );
}
